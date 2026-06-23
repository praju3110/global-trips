"""Authentication helpers — JWT, password hashing, and FastAPI dependencies."""
import uuid
import secrets
import string
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

import jwt
import bcrypt
from fastapi import Header, HTTPException

from app.config import JWT_SECRET, JWT_ALGO
from app.db import db


# ----------------------------- Utilities -----------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": now_utc() + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def gen_invite_code() -> str:
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))


# ----------------------------- Dependencies -----------------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("user_id")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_membership(trip_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.memberships.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})


async def require_member(trip_id: str, user: Dict[str, Any], min_role: str = "viewer") -> Dict[str, Any]:
    m = await get_membership(trip_id, user["user_id"])
    if not m:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    rank = {"viewer": 0, "member": 1, "admin": 2}
    if rank.get(m["role"], 0) < rank.get(min_role, 0):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return m


async def user_public(user_id: str) -> Dict[str, Any]:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        return {"user_id": user_id, "name": "Unknown", "avatar": None, "email": None}
    return {"user_id": u["user_id"], "name": u.get("name"), "avatar": u.get("avatar"), "email": u.get("email")}
