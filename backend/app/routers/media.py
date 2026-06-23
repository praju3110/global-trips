"""Media folders, media uploads (with BYOS & GCS support), and emoji reactions."""
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import byos
from app.auth import get_current_user, require_member, user_public, new_id, now_utc
from app.db import db
from app.storage import upload_to_gcs
from app.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class FolderIn(BaseModel):
    name: str


class MediaIn(BaseModel):
    folder_id: Optional[str] = None
    type: str = "photo"
    url: str
    caption: Optional[str] = None


class ReactIn(BaseModel):
    emoji: str


# ----------------------------- Routes -----------------------------
@router.get("/trips/{trip_id}/folders")
async def get_folders(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    folders = await db.media_folders.find({"trip_id": trip_id}, {"_id": 0}).to_list(500)
    return {"folders": folders}


@router.post("/trips/{trip_id}/folders")
async def add_folder(trip_id: str, body: FolderIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {
        "folder_id": new_id("fld"),
        "trip_id": trip_id,
        "name": body.name,
        "created_at": now_utc().isoformat()
    }
    await db.media_folders.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "media_updated"})
    return {"folder": {k: v for k, v in doc.items() if k != "_id"}}


@router.get("/trips/{trip_id}/media")
async def get_media(
    trip_id: str,
    folder_id: Optional[str] = None,
    uploader_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    await require_member(trip_id, user)
    q: Dict[str, Any] = {"trip_id": trip_id}
    if folder_id:
        q["folder_id"] = folder_id
    if uploader_id:
        q["uploader_id"] = uploader_id
    items = await db.media.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for it in items:
        out.append({**it, "uploader": await user_public(it["uploader_id"])})
    return {"media": out}


@router.post("/trips/{trip_id}/media")
async def add_media(trip_id: str, body: MediaIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    url = body.url
    provider_file_id = None
    storage_provider_name = None
    
    # Try BYOS if connected
    sp = (trip or {}).get("storage_provider") or {}
    if sp.get("connected"):
        storage_provider_name = sp.get("provider")
        try:
            result = await byos.upload_media_if_byos(trip, body.url, body.type)
            if result:
                url = result["url"]
                provider_file_id = result["provider_file_id"]
        except Exception as e:
            logger.warning(f"BYOS upload failed, storing locally/GCS: {e}")
            
    # Try GCS if BYOS not used and payload is base64 data URI
    if not provider_file_id and url.startswith("data:"):
        gcs_url = await upload_to_gcs(url, trip_id, "media")
        if gcs_url:
            url = gcs_url

    doc = {
        "media_id": new_id("med"),
        "trip_id": trip_id,
        "folder_id": body.folder_id,
        "uploader_id": user["user_id"],
        "type": body.type,
        "url": url,
        "caption": body.caption,
        "reactions": {},
        "storage_provider": storage_provider_name,
        "provider_file_id": provider_file_id,
        "created_at": now_utc().isoformat(),
    }
    await db.media.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "media_updated"})
    return {"media": {**{k: v for k, v in doc.items() if k != "_id"}, "uploader": await user_public(user["user_id"])}}


@router.post("/trips/{trip_id}/media/{media_id}/react")
async def react_media(trip_id: str, media_id: str, body: ReactIn, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    media = await db.media.find_one({"trip_id": trip_id, "media_id": media_id}, {"_id": 0})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    reactions = media.get("reactions", {})
    users = reactions.get(body.emoji, [])
    if user["user_id"] in users:
        users.remove(user["user_id"])
    else:
        users.append(user["user_id"])
    reactions[body.emoji] = users
    if not users:
        reactions.pop(body.emoji, None)
    await db.media.update_one({"media_id": media_id}, {"$set": {"reactions": reactions}})
    await manager.broadcast(trip_id, {"type": "media_updated"})
    return {"reactions": reactions}


@router.delete("/trips/{trip_id}/media/{media_id}")
async def delete_media(trip_id: str, media_id: str, user=Depends(get_current_user)):
    m = await require_member(trip_id, user)
    media = await db.media.find_one({"trip_id": trip_id, "media_id": media_id}, {"_id": 0})
    if media and (media["uploader_id"] == user["user_id"] or m["role"] == "admin"):
        await db.media.delete_one({"media_id": media_id})
        await manager.broadcast(trip_id, {"type": "media_updated"})
        return {"ok": True}
    raise HTTPException(status_code=403, detail="Cannot delete this media")
