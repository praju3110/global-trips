"""Expenses, transactions, settlements, and trip wrapped."""
import secrets
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_member, user_public, new_id, now_utc
from app.db import db
from app.websocket import manager

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
class SplitEntry(BaseModel):
    user_id: str
    value: float = 0  # interpretation depends on split_method


class ExpenseIn(BaseModel):
    title: str
    category: str = "other"
    amount: float
    currency: str = "USD"
    paid_by: str
    date: Optional[str] = None
    split_method: str = "equal"  # equal | percentage | exact | shares
    participants: List[str] = []  # for equal
    splits: List[SplitEntry] = []  # for percentage/exact/shares
    notes: Optional[str] = None


class TransactionIn(BaseModel):
    from_user: str
    to_user: str
    amount: float
    currency: str = "USD"
    note: Optional[str] = None
    date: Optional[str] = None


# ----------------------------- Helpers -----------------------------
def compute_splits(body: ExpenseIn) -> List[Dict[str, Any]]:
    out = []
    if body.split_method == "equal":
        parts = body.participants or [s.user_id for s in body.splits]
        if not parts:
            return []
        share = round(body.amount / len(parts), 2)
        for p in parts:
            out.append({"user_id": p, "value": 0, "amount": share})
    elif body.split_method == "percentage":
        for s in body.splits:
            out.append({"user_id": s.user_id, "value": s.value, "amount": round(body.amount * s.value / 100, 2)})
    elif body.split_method == "exact":
        for s in body.splits:
            out.append({"user_id": s.user_id, "value": s.value, "amount": round(s.value, 2)})
    elif body.split_method == "shares":
        total = sum(s.value for s in body.splits) or 1
        for s in body.splits:
            out.append({"user_id": s.user_id, "value": s.value, "amount": round(body.amount * s.value / total, 2)})
    return out


async def build_unit_map(trip_id: str, trip_type: str):
    """Returns (unit_of[user_id] -> unit_id, unit_label[unit_id] -> name)."""
    members = await db.memberships.find({"trip_id": trip_id}, {"_id": 0}).to_list(500)
    unit_of = {}
    unit_label = {}
    pub_cache = {}
    for m in members:
        pub_cache[m["user_id"]] = await user_public(m["user_id"])
    
    if trip_type == "family":
        for m in members:
            head = m.get("family_head_id") or m["user_id"]
            unit_of[m["user_id"]] = head
        for uid, head in unit_of.items():
            if head not in unit_label:
                unit_label[head] = (pub_cache.get(head) or {}).get("name") or "Family"
    else:
        for m in members:
            unit_of[m["user_id"]] = m["user_id"]
            unit_label[m["user_id"]] = pub_cache[m["user_id"]].get("name") or "Member"
    return unit_of, unit_label, pub_cache


async def compute_wrapped(trip):
    trip_id = trip["trip_id"]
    exps = await db.expenses.find({"trip_id": trip_id}, {"_id": 0}).to_list(2000)
    media = await db.media.find({"trip_id": trip_id}, {"_id": 0}).to_list(2000)
    days = await db.itinerary_days.count_documents({"trip_id": trip_id})
    members = await db.memberships.count_documents({"trip_id": trip_id})

    total = round(sum(e.get("amount", 0) for e in exps), 2)
    paid_by: Dict[str, float] = {}
    day_totals: Dict[str, float] = {}
    cat: Dict[str, float] = {}
    for e in exps:
        paid_by[e.get("paid_by")] = paid_by.get(e.get("paid_by"), 0) + e.get("amount", 0)
        d = (e.get("date") or "")[:10]
        day_totals[d] = day_totals.get(d, 0) + e.get("amount", 0)
        cat[e.get("category", "other")] = cat.get(e.get("category", "other"), 0) + e.get("amount", 0)

    biggest_spender = max(paid_by.items(), key=lambda x: x[1]) if paid_by else None
    most_expensive_day = max(day_totals.items(), key=lambda x: x[1]) if day_totals else None
    top_category = max(cat.items(), key=lambda x: x[1]) if cat else None

    photographer: Dict[str, int] = {}
    for m in media:
        photographer[m["uploader_id"]] = photographer.get(m["uploader_id"], 0) + 1
    top_photographer = max(photographer.items(), key=lambda x: x[1]) if photographer else None

    def reaction_count(m):
        return sum(len(v) for v in (m.get("reactions") or {}).values())
    most_reacted = max(media, key=reaction_count) if media else None

    return {
        "trip_title": trip.get("title"),
        "destination": trip.get("destination"),
        "total_spent": total,
        "currency": exps[0]["currency"] if exps else "USD",
        "num_days": days,
        "num_members": members,
        "num_photos": len(media),
        "num_expenses": len(exps),
        "biggest_spender": {"name": (await user_public(biggest_spender[0]))["name"], "amount": round(biggest_spender[1], 2)} if biggest_spender else None,
        "most_expensive_day": {"date": most_expensive_day[0], "amount": round(most_expensive_day[1], 2)} if most_expensive_day else None,
        "top_category": {"name": top_category[0], "amount": round(top_category[1], 2)} if top_category else None,
        "top_photographer": {"name": (await user_public(top_photographer[0]))["name"], "count": top_photographer[1]} if top_photographer else None,
        "most_reacted_photo": {"url": most_reacted["url"], "reactions": reaction_count(most_reacted)} if most_reacted and reaction_count(most_reacted) > 0 else None,
    }


# ----------------------------- Routes -----------------------------
@router.get("/trips/{trip_id}/expenses")
async def get_expenses(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    exps = await db.expenses.find({"trip_id": trip_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return {"expenses": exps}


@router.post("/trips/{trip_id}/expenses")
async def add_expense(trip_id: str, body: ExpenseIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    splits = compute_splits(body)
    doc = {
        "expense_id": new_id("exp"),
        "trip_id": trip_id,
        "title": body.title,
        "category": body.category,
        "amount": body.amount,
        "currency": body.currency,
        "paid_by": body.paid_by,
        "date": body.date or now_utc().isoformat(),
        "split_method": body.split_method,
        "splits": splits,
        "notes": body.notes,
        "created_by": user["user_id"],
        "created_at": now_utc().isoformat(),
    }
    await db.expenses.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "expenses_updated"})
    return {"expense": {k: v for k, v in doc.items() if k != "_id"}}


@router.put("/trips/{trip_id}/expenses/{expense_id}")
async def update_expense(trip_id: str, expense_id: str, body: ExpenseIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    splits = compute_splits(body)
    update = {
        "title": body.title,
        "category": body.category,
        "amount": body.amount,
        "currency": body.currency,
        "paid_by": body.paid_by,
        "date": body.date,
        "split_method": body.split_method,
        "splits": splits,
        "notes": body.notes,
    }
    await db.expenses.update_one({"trip_id": trip_id, "expense_id": expense_id}, {"$set": update})
    exp = await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "expenses_updated"})
    return {"expense": exp}


@router.delete("/trips/{trip_id}/expenses/{expense_id}")
async def delete_expense(trip_id: str, expense_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.expenses.delete_one({"trip_id": trip_id, "expense_id": expense_id})
    await manager.broadcast(trip_id, {"type": "expenses_updated"})
    return {"ok": True}


@router.get("/trips/{trip_id}/expenses/summary")
async def expense_summary(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    exps = await db.expenses.find({"trip_id": trip_id}, {"_id": 0}).to_list(2000)
    txns = await db.transactions.find({"trip_id": trip_id}, {"_id": 0}).to_list(2000)
    unit_of, unit_label, pub_cache = await build_unit_map(trip_id, trip.get("trip_type", "group"))

    balances: Dict[str, float] = {u: 0.0 for u in set(unit_of.values())}
    category_totals: Dict[str, float] = {}
    paid_by_totals: Dict[str, float] = {}
    day_totals: Dict[str, float] = {}
    total_spent = 0.0
    currency = trip.get("currency") or (exps[0]["currency"] if exps else "USD")

    for e in exps:
        amt = e.get("amount", 0)
        total_spent += amt
        category_totals[e.get("category", "other")] = category_totals.get(e.get("category", "other"), 0) + amt
        payer_unit = unit_of.get(e.get("paid_by"), e.get("paid_by"))
        if payer_unit in balances:
            balances[payer_unit] += amt
        paid_by_totals[e.get("paid_by")] = paid_by_totals.get(e.get("paid_by"), 0) + amt
        d = (e.get("date") or "")[:10]
        day_totals[d] = day_totals.get(d, 0) + amt
        for s in e.get("splits", []):
            su = unit_of.get(s["user_id"], s["user_id"])
            if su in balances:
                balances[su] -= s.get("amount", 0)

    for t in txns:
        fu = unit_of.get(t["from_user"], t["from_user"])
        tu = unit_of.get(t["to_user"], t["to_user"])
        if fu in balances:
            balances[fu] += t.get("amount", 0)
        if tu in balances:
            balances[tu] -= t.get("amount", 0)

    # Greedy settle
    creditors = sorted([(u, b) for u, b in balances.items() if b > 0.01], key=lambda x: -x[1])
    debtors = sorted([(u, -b) for u, b in balances.items() if b < -0.01], key=lambda x: -x[1])
    settlements = []
    ci, di = 0, 0
    creditors = [list(c) for c in creditors]
    debtors = [list(d) for d in debtors]
    while ci < len(creditors) and di < len(debtors):
        amt = min(creditors[ci][1], debtors[di][1])
        settlements.append({
            "from": debtors[di][0],
            "from_name": unit_label.get(debtors[di][0], "?"),
            "to": creditors[ci][0],
            "to_name": unit_label.get(creditors[ci][0], "?"),
            "amount": round(amt, 2),
        })
        creditors[ci][1] -= amt
        debtors[di][1] -= amt
        if creditors[ci][1] < 0.01:
            ci += 1
        if debtors[di][1] < 0.01:
            di += 1

    balance_list = [{"unit_id": u, "name": unit_label.get(u, "?"), "net": round(b, 2)} for u, b in balances.items()]
    balance_list.sort(key=lambda x: -x["net"])

    # Fun facts
    big_splurge = max(exps, key=lambda e: e.get("amount", 0)) if exps else None
    top_spender = max(paid_by_totals.items(), key=lambda x: x[1]) if paid_by_totals else None
    most_expensive_day = max(day_totals.items(), key=lambda x: x[1]) if day_totals else None
    num_days = len([d for d in day_totals]) or 1
    daily_burn = round(total_spent / num_days, 2)

    fun_facts = {
        "big_splurge": {"title": big_splurge["title"], "amount": big_splurge["amount"]} if big_splurge else None,
        "top_spender": {"name": (pub_cache.get(top_spender[0]) or {}).get("name", "?"), "amount": round(top_spender[1], 2)} if top_spender else None,
        "most_expensive_day": {"date": most_expensive_day[0], "amount": round(most_expensive_day[1], 2)} if most_expensive_day else None,
        "daily_burn_rate": daily_burn,
        "expense_count": len(exps),
    }

    return {
        "total_spent": round(total_spent, 2),
        "currency": currency,
        "balances": balance_list,
        "settlements": settlements,
        "category_totals": category_totals,
        "fun_facts": fun_facts,
        "trip_type": trip.get("trip_type", "group"),
    }


# ----------------------------- Transactions -----------------------------
@router.get("/trips/{trip_id}/transactions")
async def get_transactions(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    txns = await db.transactions.find({"trip_id": trip_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    out = []
    for t in txns:
        out.append({
            **t,
            "from_name": (await user_public(t["from_user"]))["name"],
            "to_name": (await user_public(t["to_user"]))["name"]
        })
    return {"transactions": out}


@router.post("/trips/{trip_id}/transactions")
async def add_transaction(trip_id: str, body: TransactionIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {
        "transaction_id": new_id("txn"),
        "trip_id": trip_id,
        "created_at": now_utc().isoformat(),
        "date": body.date or now_utc().isoformat(),
        **{k: v for k, v in body.dict().items() if k != "date"}
    }
    await db.transactions.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "expenses_updated"})
    return {"transaction": {k: v for k, v in doc.items() if k != "_id"}}


@router.delete("/trips/{trip_id}/transactions/{transaction_id}")
async def delete_transaction(trip_id: str, transaction_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.transactions.delete_one({"trip_id": trip_id, "transaction_id": transaction_id})
    await manager.broadcast(trip_id, {"type": "expenses_updated"})
    return {"ok": True}


# ----------------------------- Trip Wrapped -----------------------------
@router.get("/trips/{trip_id}/wrapped")
async def get_trip_wrapped(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return await compute_wrapped(trip)


@router.post("/trips/{trip_id}/wrapped/share")
async def share_wrapped(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    token = trip.get("share_token")
    if not token:
        token = secrets.token_urlsafe(9)
        await db.trips.update_one({"trip_id": trip_id}, {"$set": {"share_token": token}})
    return {"share_token": token}


@router.get("/public/wrapped/{share_token}")
async def public_wrapped(share_token: str):
    trip = await db.trips.find_one({"share_token": share_token}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="This recap link is no longer available")
    return await compute_wrapped(trip)
