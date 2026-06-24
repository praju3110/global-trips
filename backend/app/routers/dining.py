"""Dining / restaurant bill splitting routes."""
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_member, user_public, new_id, now_utc
from app.db import db
from app.websocket import manager

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class DiningIn(BaseModel):
    restaurant_name: str
    tax_percent: float = 0
    tip_amount: float = 0


class DiningUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    tax_percent: Optional[float] = None
    tip_amount: Optional[float] = None
    status: Optional[str] = None


class MenuItemIn(BaseModel):
    name: str
    price: float
    veg: bool = True
    ordered_by: List[str] = []


# ----------------------------- Routes -----------------------------
@router.get("/trips/{trip_id}/dining")
async def get_dining(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    sessions = await db.dining_sessions.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"sessions": sessions}


@router.post("/trips/{trip_id}/dining")
async def create_dining(trip_id: str, body: DiningIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {
        "session_id": new_id("din"),
        "trip_id": trip_id,
        "restaurant_name": body.restaurant_name,
        "tax_percent": body.tax_percent,
        "tip_amount": body.tip_amount,
        "status": "open",
        "items": [],
        "created_by": user["user_id"],
        "created_at": now_utc().isoformat(),
    }
    await db.dining_sessions.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "dining_updated"})
    return {"session": {k: v for k, v in doc.items() if k != "_id"}}


@router.put("/trips/{trip_id}/dining/{session_id}")
async def update_dining(trip_id: str, session_id: str, body: DiningUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.dining_sessions.update_one({"trip_id": trip_id, "session_id": session_id}, {"$set": update})
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "dining_updated"})
    return {"session": s}


@router.post("/trips/{trip_id}/dining/{session_id}/items")
async def add_dining_item(trip_id: str, session_id: str, body: MenuItemIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    item = {"item_id": new_id("item"), **body.dict()}
    await db.dining_sessions.update_one(
        {"trip_id": trip_id, "session_id": session_id},
        {"$push": {"items": item}}
    )
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "dining_updated"})
    return {"session": s}


@router.delete("/trips/{trip_id}/dining/{session_id}/items/{item_id}")
async def delete_dining_item(trip_id: str, session_id: str, item_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.dining_sessions.update_one(
        {"trip_id": trip_id, "session_id": session_id},
        {"$pull": {"items": {"item_id": item_id}}}
    )
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "dining_updated"})
    return {"session": s}


@router.delete("/trips/{trip_id}/dining/{session_id}")
async def delete_dining(trip_id: str, session_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.dining_sessions.delete_one({"trip_id": trip_id, "session_id": session_id})
    await manager.broadcast(trip_id, {"type": "dining_updated"})
    return {"ok": True}


@router.get("/trips/{trip_id}/dining/{session_id}/split")
async def dining_split(trip_id: str, session_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    s = await db.dining_sessions.find_one({"trip_id": trip_id, "session_id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    per_user: Dict[str, float] = {}
    subtotal = 0.0
    for item in s.get("items", []):
        subtotal += item["price"]
        orderers = item.get("ordered_by", [])
        if orderers:
            share = item["price"] / len(orderers)
            for u in orderers:
                per_user[u] = per_user.get(u, 0) + share
    tax = subtotal * s.get("tax_percent", 0) / 100
    tip = s.get("tip_amount", 0)
    total = subtotal + tax + tip
    # distribute tax+tip proportionally
    extras = tax + tip
    
    # Batch fetch participant names in 1 query
    breakdown = []
    user_ids = list(per_user.keys())
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}).to_list(len(user_ids)) if user_ids else []
    user_map = {u["user_id"]: u for u in users}
    
    for u, food in per_user.items():
        prop = (food / subtotal) if subtotal else 0
        share_extra = extras * prop
        breakdown.append({
            "user_id": u,
            "name": (user_map.get(u) or {}).get("name") or "Unknown",
            "food": round(food, 2),
            "extras": round(share_extra, 2),
            "total": round(food + share_extra, 2),
        })
    breakdown.sort(key=lambda x: -x["total"])
    return {
        "subtotal": round(subtotal, 2),
        "tax": round(tax, 2),
        "tip": round(tip, 2),
        "total": round(total, 2),
        "breakdown": breakdown
    }
