"""Auth routes — registration, login, Google OAuth, profile."""
from fastapi import APIRouter, Depends
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

import httpx

from app.auth import (
    get_current_user, user_public,
    hash_password, verify_password, create_jwt, new_id, now_utc,
)
from app.config import EMERGENT_SESSION_URL
from app.db import db

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    session_id: str


class ProfileIn(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None


# ----------------------------- Routes -----------------------------
@router.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "avatar": None,
        "password_hash": hash_password(body.password),
        "auth_provider": "email",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_jwt(user_id)
    return {"token": token, "user": await user_public(user_id)}


@router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user["user_id"])
    return {"token": token, "user": await user_public(user["user_id"])}


@router.post("/auth/google")
async def google_login(body: GoogleIn):
    async with httpx.AsyncClient(timeout=20) as hc:
        resp = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Google authentication failed")
    data = resp.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email from provider")
    user = await db.users.find_one({"email": email})
    if user:
        user_id = user["user_id"]
        if not user.get("avatar") and data.get("picture"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"avatar": data.get("picture")}})
    else:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "avatar": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "created_at": now_utc().isoformat(),
        })
    token = create_jwt(user_id)
    return {"token": token, "user": await user_public(user_id)}


@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"user": user}


@router.put("/auth/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"user": await user_public(user["user_id"])}
