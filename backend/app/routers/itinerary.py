"""Itinerary routes — day timeline, start/stop active day."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.auth import get_current_user, require_member, new_id, now_utc
from app.db import db
from app.websocket import manager

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class DayIn(BaseModel):
    title: str
    date: Optional[str] = None
    description: Optional[str] = None


class DayUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None


# ----------------------------- Routes -----------------------------
@router.get("/trips/{trip_id}/itinerary")
async def get_itinerary(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    days = await db.itinerary_days.find({"trip_id": trip_id}, {"_id": 0}).sort("day_number", 1).to_list(500)
    return {"days": days}


@router.post("/trips/{trip_id}/itinerary")
async def add_day(trip_id: str, body: DayIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    count = await db.itinerary_days.count_documents({"trip_id": trip_id})
    doc = {
        "day_id": new_id("day"),
        "trip_id": trip_id,
        "day_number": count + 1,
        "title": body.title,
        "date": body.date,
        "description": body.description,
        "is_active": False,
        "started_at": None,
        "created_at": now_utc().isoformat(),
    }
    await db.itinerary_days.insert_one(doc)
    doc.pop("_id", None)
    await manager.broadcast(trip_id, {"type": "itinerary_updated"})
    return {"day": {k: v for k, v in doc.items() if k != "_id"}}


@router.put("/trips/{trip_id}/itinerary/{day_id}")
async def update_day(trip_id: str, day_id: str, body: DayUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id}, {"$set": update})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "itinerary_updated"})
    return {"day": day}


@router.post("/trips/{trip_id}/itinerary/{day_id}/start")
async def start_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.itinerary_days.update_many({"trip_id": trip_id}, {"$set": {"is_active": False}})
    await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id},
                                       {"$set": {"is_active": True, "started_at": now_utc().isoformat()}})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "day_started", "day_id": day_id})
    return {"day": day}


@router.post("/trips/{trip_id}/itinerary/{day_id}/stop")
async def stop_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id}, {"$set": {"is_active": False}})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "day_stopped", "day_id": day_id})
    return {"day": day}


@router.delete("/trips/{trip_id}/itinerary/{day_id}")
async def delete_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.itinerary_days.delete_one({"trip_id": trip_id, "day_id": day_id})
    await manager.broadcast(trip_id, {"type": "itinerary_updated"})
    return {"ok": True}
