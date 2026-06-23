"""BYOS (Bring Your Own Storage) — Google Drive & OneDrive OAuth + upload.

A trip ADMIN connects their personal cloud account. The backend stores an
encrypted refresh token per trip and uploads members' media into the admin's
cloud, persisting only file references in MongoDB.
"""
import os
import json
import uuid
import base64
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

import jwt
import httpx
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from cryptography.fernet import Fernet
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

MONGO_URL = os.environ["MONGO_URL"]
_client = AsyncIOMotorClient(MONGO_URL)
db = _client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
_fernet = Fernet(os.environ["BYOS_FERNET_KEY"].encode())

PROVIDERS = {
    "gdrive": {
        "label": "Google Drive",
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "openid email https://www.googleapis.com/auth/drive.file",
    },
    "onedrive": {
        "label": "OneDrive",
        "client_id_env": "MS_CLIENT_ID",
        "client_secret_env": "MS_CLIENT_SECRET",
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "offline_access Files.ReadWrite User.Read",
    },
}

router = APIRouter(prefix="/api/byos")


def _now():
    return datetime.now(timezone.utc)


def _redirect_uri(provider: str) -> str:
    return f"{PUBLIC_APP_URL}/api/byos/{provider}/callback"


def provider_configured(provider: str) -> bool:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return False
    return bool(os.environ.get(cfg["client_id_env"]) and os.environ.get(cfg["client_secret_env"]))


def enc(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def dec(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()


@router.get("/config")
async def byos_config():
    return {
        "providers": [
            {"key": k, "label": v["label"], "configured": provider_configured(k)}
            for k, v in PROVIDERS.items()
        ]
    }


# --------------------------- OAuth: start ---------------------------
@router.get("/{provider}/start")
async def byos_start(provider: str, trip_id: str = Query(...), token: str = Query(...), client_redirect: str = Query("")):
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown provider")
    if not provider_configured(provider):
        raise HTTPException(status_code=400, detail=f"{cfg['label']} is not configured on the server")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload["user_id"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    membership = await db.memberships.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not membership or membership.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the trip admin can connect storage")

    state = jwt.encode(
        {"trip_id": trip_id, "user_id": user_id, "provider": provider,
         "client_redirect": client_redirect, "exp": _now() + timedelta(minutes=15)},
        JWT_SECRET, algorithm="HS256",
    )
    params = {
        "client_id": os.environ[cfg["client_id_env"]],
        "redirect_uri": _redirect_uri(provider),
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
    }
    if provider == "gdrive":
        params["access_type"] = "offline"
        params["prompt"] = "consent"
        params["include_granted_scopes"] = "true"
    return RedirectResponse(f"{cfg['auth_url']}?{urlencode(params)}")


def _fail_redirect(client_redirect: str, msg: str) -> RedirectResponse:
    target = client_redirect or f"{PUBLIC_APP_URL}/"
    sep = "&" if "?" in target else "?"
    return RedirectResponse(f"{target}{sep}byos=error&message={msg}")


# --------------------------- OAuth: callback ---------------------------
@router.get("/{provider}/callback")
async def byos_callback(provider: str, code: str = Query(None), state: str = Query(None), error: str = Query(None)):
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown provider")
    try:
        st = jwt.decode(state, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid state")
    client_redirect = st.get("client_redirect") or f"{PUBLIC_APP_URL}/trip/{st['trip_id']}/settings"
    if error or not code:
        return _fail_redirect(client_redirect, "authorization_denied")

    # Exchange code for tokens
    data = {
        "code": code,
        "client_id": os.environ[cfg["client_id_env"]],
        "client_secret": os.environ[cfg["client_secret_env"]],
        "redirect_uri": _redirect_uri(provider),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.post(cfg["token_url"], data=data)
    if resp.status_code != 200:
        return _fail_redirect(client_redirect, "token_exchange_failed")
    tok = resp.json()
    refresh_token = tok.get("refresh_token")
    access_token = tok.get("access_token")
    if not refresh_token:
        return _fail_redirect(client_redirect, "no_refresh_token")

    # Identify account + create per-trip folder
    email, folder_id = await _provision(provider, access_token, st["trip_id"])

    storage = {
        "provider": provider,
        "account_label": email or PROVIDERS[provider]["label"],
        "connected": True,
        "folder_id": folder_id,
        "refresh_token_enc": enc(refresh_token),
        "connected_by": st["user_id"],
        "connected_at": _now().isoformat(),
    }
    await db.trips.update_one({"trip_id": st["trip_id"]}, {"$set": {"storage_provider": storage}})

    sep = "&" if "?" in client_redirect else "?"
    return RedirectResponse(f"{client_redirect}{sep}byos=success")


async def _provision(provider: str, access_token: str, trip_id: str) -> Tuple[Optional[str], Optional[str]]:
    headers = {"Authorization": f"Bearer {access_token}"}
    folder_name = f"RoamSync · {trip_id[:12]}"
    async with httpx.AsyncClient(timeout=30) as hc:
        if provider == "gdrive":
            ui = await hc.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
            email = ui.json().get("email") if ui.status_code == 200 else None
            fr = await hc.post(
                "https://www.googleapis.com/drive/v3/files",
                headers={**headers, "Content-Type": "application/json"},
                json={"name": folder_name, "mimeType": "application/vnd.google-apps.folder"},
            )
            folder_id = fr.json().get("id") if fr.status_code in (200, 201) else None
            return email, folder_id
        else:  # onedrive
            me = await hc.get("https://graph.microsoft.com/v1.0/me", headers=headers)
            email = (me.json().get("userPrincipalName") or me.json().get("mail")) if me.status_code == 200 else None
            fr = await hc.post(
                "https://graph.microsoft.com/v1.0/me/drive/root/children",
                headers={**headers, "Content-Type": "application/json"},
                json={"name": folder_name, "folder": {}, "@microsoft.graph.conflictBehavior": "rename"},
            )
            folder_id = fr.json().get("id") if fr.status_code in (200, 201) else None
            return email, folder_id


# --------------------------- Token refresh ---------------------------
async def _access_token(provider: str, refresh_token: str) -> str:
    cfg = PROVIDERS[provider]
    data = {
        "client_id": os.environ[cfg["client_id_env"]],
        "client_secret": os.environ[cfg["client_secret_env"]],
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    if provider == "onedrive":
        data["scope"] = cfg["scope"]
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.post(cfg["token_url"], data=data)
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Storage connection expired — admin must reconnect")
    return resp.json()["access_token"]


def _parse_data_uri(data_uri: str) -> Tuple[str, bytes]:
    m = re.match(r"data:(?P<mime>[^;]+);base64,(?P<data>.+)", data_uri, re.DOTALL)
    if not m:
        return "image/jpeg", base64.b64decode(data_uri.split(",")[-1]) if "," in data_uri else b""
    return m.group("mime"), base64.b64decode(m.group("data"))


async def upload_media_if_byos(trip: Dict[str, Any], data_uri: str, media_type: str) -> Optional[Dict[str, str]]:
    """If the trip has connected BYOS storage and the payload is a base64 data URI,
    upload to the provider and return {'url', 'provider_file_id'}. Otherwise None."""
    sp = trip.get("storage_provider") or {}
    if not sp.get("connected") or not sp.get("refresh_token_enc"):
        return None
    if not data_uri.startswith("data:"):
        return None  # already a remote URL
    provider = sp["provider"]
    refresh_token = dec(sp["refresh_token_enc"])
    access_token = await _access_token(provider, refresh_token)
    mime, file_bytes = _parse_data_uri(data_uri)
    ext = (mime.split("/")[-1] or "jpg").split("+")[0]
    filename = f"{uuid.uuid4().hex}.{ext}"
    folder_id = sp.get("folder_id")

    async with httpx.AsyncClient(timeout=120) as hc:
        if provider == "gdrive":
            boundary = f"==={uuid.uuid4().hex}==="
            meta = {"name": filename, "parents": [folder_id] if folder_id else []}
            body = (
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                + json.dumps(meta)
                + f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n"
            ).encode() + file_bytes + f"\r\n--{boundary}--".encode()
            up = await hc.post(
                "https://www.googleapis.com/upload/drive/v3/files",
                params={"uploadType": "multipart", "fields": "id"},
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": f"multipart/related; boundary={boundary}"},
                content=body,
            )
            up.raise_for_status()
            fid = up.json()["id"]
            await hc.post(
                f"https://www.googleapis.com/drive/v3/files/{fid}/permissions",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json={"role": "reader", "type": "anyone"},
            )
            url = f"https://drive.google.com/uc?export=view&id={fid}"
            return {"url": url, "provider_file_id": fid}
        else:  # onedrive — simple upload (<4MB) + anonymous view link
            path = f"https://graph.microsoft.com/v1.0/me/drive/items/{folder_id}:/{filename}:/content" if folder_id \
                else f"https://graph.microsoft.com/v1.0/me/drive/root:/{filename}:/content"
            up = await hc.put(path, headers={"Authorization": f"Bearer {access_token}", "Content-Type": mime}, content=file_bytes)
            up.raise_for_status()
            item = up.json()
            fid = item["id"]
            download_url = item.get("@microsoft.graph.downloadUrl")
            link = await hc.post(
                f"https://graph.microsoft.com/v1.0/me/drive/items/{fid}/createLink",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json={"type": "view", "scope": "anonymous"},
            )
            url = download_url
            if link.status_code in (200, 201):
                url = link.json().get("link", {}).get("webUrl") or download_url
            return {"url": url, "provider_file_id": fid}
