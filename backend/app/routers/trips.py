"""Trip CRUD, membership management, invite/join, storage config."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

from app.auth import (
    get_current_user, get_membership, require_member,
    user_public, new_id, now_utc, gen_invite_code,
)
from app.db import db
from app.websocket import manager

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class TripIn(BaseModel):
    title: str
    destination: str
    start_date: str
    end_date: str
    cover_image: Optional[str] = None
    trip_type: str = "group"  # solo | group | family


class TripUpdate(BaseModel):
    title: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    cover_image: Optional[str] = None
    trip_type: Optional[str] = None


class JoinIn(BaseModel):
    invite_code: str


class MemberUpdate(BaseModel):
    role: Optional[str] = None
    family_head_id: Optional[str] = None


class StorageIn(BaseModel):
    provider: str  # gdrive | onedrive | icloud
    account_label: str
    folder_url: Optional[str] = None


class AddMemberIn(BaseModel):
    email: EmailStr
    role: str = "member"


# ----------------------------- Helpers -----------------------------
def trip_status(trip: Dict[str, Any]) -> str:
    try:
        end = datetime.fromisoformat(trip["end_date"])
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return "past" if end < now_utc() else "upcoming"
    except Exception:
        return "upcoming"


async def enrich_trip(trip: Dict[str, Any]) -> Dict[str, Any]:
    trip = {k: v for k, v in trip.items() if k != "_id"}
    sp = trip.get("storage_provider")
    if isinstance(sp, dict):
        trip["storage_provider"] = {
            "provider": sp.get("provider"),
            "account_label": sp.get("account_label"),
            "connected": bool(sp.get("connected")),
            "connected_at": sp.get("connected_at"),
        }
    trip["status"] = trip_status(trip)
    trip["member_count"] = await db.memberships.count_documents({"trip_id": trip["trip_id"]})
    return trip


# ----------------------------- Trip Routes -----------------------------
@router.get("/trips")
async def list_trips(user=Depends(get_current_user)):
    memberships = await db.memberships.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    trip_ids = [m["trip_id"] for m in memberships]
    role_map = {m["trip_id"]: m["role"] for m in memberships}
    trips = await db.trips.find({"trip_id": {"$in": trip_ids}}, {"_id": 0}).to_list(500)
    out = []
    for t in trips:
        e = await enrich_trip(t)
        e["my_role"] = role_map.get(t["trip_id"], "viewer")
        out.append(e)
    out.sort(key=lambda x: x.get("start_date", ""), reverse=True)
    return {"trips": out}


@router.post("/trips")
async def create_trip(body: TripIn, user=Depends(get_current_user)):
    trip_id = new_id("trip")
    code = gen_invite_code()
    while await db.trips.find_one({"invite_code": code}):
        code = gen_invite_code()
    doc = {
        "trip_id": trip_id,
        "title": body.title,
        "destination": body.destination,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "cover_image": body.cover_image,
        "trip_type": body.trip_type,
        "invite_code": code,
        "admin_id": user["user_id"],
        "storage_provider": None,
        "created_at": now_utc().isoformat(),
    }
    await db.trips.insert_one(doc)
    await db.memberships.insert_one({
        "membership_id": new_id("mem"),
        "trip_id": trip_id,
        "user_id": user["user_id"],
        "role": "admin",
        "family_head_id": None,
        "joined_at": now_utc().isoformat(),
    })
    e = await enrich_trip(doc)
    e["my_role"] = "admin"
    return {"trip": e}


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, user=Depends(get_current_user)):
    m = await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    e = await enrich_trip(trip)
    e["my_role"] = m["role"]
    return {"trip": e}


@router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, body: TripUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.trips.update_one({"trip_id": trip_id}, {"$set": update})
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    return {"trip": await enrich_trip(trip)}


@router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    for col in ["trips", "memberships", "itinerary_days", "travel_segments", "expenses", "transactions", "media", "media_folders", "dining_sessions"]:
        await db[col].delete_many({"trip_id": trip_id})
    return {"ok": True}


@router.put("/trips/{trip_id}/storage")
async def set_storage(trip_id: str, body: StorageIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.trips.update_one({"trip_id": trip_id}, {"$set": {"storage_provider": body.dict()}})
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    return {"trip": await enrich_trip(trip)}


@router.delete("/trips/{trip_id}/storage")
async def disconnect_storage(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.trips.update_one({"trip_id": trip_id}, {"$set": {"storage_provider": None}})
    return {"ok": True}


@router.post("/trips/join")
async def join_trip(body: JoinIn, user=Depends(get_current_user)):
    trip = await db.trips.find_one({"invite_code": body.invite_code.upper()}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    existing = await get_membership(trip["trip_id"], user["user_id"])
    if existing:
        e = await enrich_trip(trip)
        e["my_role"] = existing["role"]
        return {"trip": e, "already_member": True}
    await db.memberships.insert_one({
        "membership_id": new_id("mem"),
        "trip_id": trip["trip_id"],
        "user_id": user["user_id"],
        "role": "member",
        "family_head_id": None,
        "joined_at": now_utc().isoformat(),
    })
    e = await enrich_trip(trip)
    e["my_role"] = "member"
    # Broadcast membership update
    await manager.broadcast(trip["trip_id"], {"type": "member_joined", "user_id": user["user_id"]})
    return {"trip": e, "already_member": False}


# ----------------------------- Members -----------------------------
@router.get("/trips/{trip_id}/members")
async def list_members(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    members = await db.memberships.find({"trip_id": trip_id}, {"_id": 0}).to_list(500)
    out = []
    for m in members:
        pub = await user_public(m["user_id"])
        out.append({**m, **pub})
    return {"members": out}


@router.post("/trips/{trip_id}/members/add")
async def add_member_by_email(trip_id: str, body: AddMemberIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    target = await db.users.find_one({"email": body.email.lower()}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No RoamSync user with that email. Share the invite code instead.")
    existing = await get_membership(trip_id, target["user_id"])
    if existing:
        raise HTTPException(status_code=400, detail="This person is already a member")
    role = body.role if body.role in ("admin", "member", "viewer") else "member"
    await db.memberships.insert_one({
        "membership_id": new_id("mem"),
        "trip_id": trip_id,
        "user_id": target["user_id"],
        "role": role,
        "family_head_id": None,
        "joined_at": now_utc().isoformat(),
    })
    # Broadcast membership update
    await manager.broadcast(trip_id, {"type": "member_added", "user_id": target["user_id"]})
    return {"ok": True, "member": {**await user_public(target["user_id"]), "role": role}}


@router.put("/trips/{trip_id}/members/{member_user_id}")
async def update_member(trip_id: str, member_user_id: str, body: MemberUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    update = {}
    if body.role is not None:
        update["role"] = body.role
    if body.family_head_id is not None:
        update["family_head_id"] = body.family_head_id if body.family_head_id else None
    if update:
        await db.memberships.update_one({"trip_id": trip_id, "user_id": member_user_id}, {"$set": update})
    return {"ok": True}


@router.delete("/trips/{trip_id}/members/{member_user_id}")
async def remove_member(trip_id: str, member_user_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.memberships.delete_one({"trip_id": trip_id, "user_id": member_user_id})
    return {"ok": True}
