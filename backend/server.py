from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import re
import logging
import secrets
import string
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx
import byos

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ----------------------------- Helpers -----------------------------
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


class DayIn(BaseModel):
    title: str
    date: Optional[str] = None
    description: Optional[str] = None


class DayUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None


class Passenger(BaseModel):
    name: str
    coach: Optional[str] = None
    seat: Optional[str] = None
    berth: Optional[str] = None
    status: Optional[str] = "Confirmed"


class TravelIn(BaseModel):
    mode: str  # flight | train | bus | car
    provider_name: Optional[str] = None
    code: Optional[str] = None
    origin: str
    destination: str
    depart_time: Optional[str] = None
    arrive_time: Optional[str] = None
    ticket_file: Optional[str] = None
    ticket_filename: Optional[str] = None
    passengers: List[Passenger] = []


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


class FolderIn(BaseModel):
    name: str


class MediaIn(BaseModel):
    folder_id: Optional[str] = None
    type: str = "photo"
    url: str
    caption: Optional[str] = None


class ReactIn(BaseModel):
    emoji: str


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


# ----------------------------- Auth Routes -----------------------------
@api_router.post("/auth/register")
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


@api_router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user["user_id"])
    return {"token": token, "user": await user_public(user["user_id"])}


@api_router.post("/auth/google")
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


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"user": user}


@api_router.put("/auth/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"user": await user_public(user["user_id"])}


# ----------------------------- Trip Routes -----------------------------
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


@api_router.get("/trips")
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


@api_router.post("/trips")
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


@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, user=Depends(get_current_user)):
    m = await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    e = await enrich_trip(trip)
    e["my_role"] = m["role"]
    return {"trip": e}


@api_router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, body: TripUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.trips.update_one({"trip_id": trip_id}, {"$set": update})
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    return {"trip": await enrich_trip(trip)}


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    for col in ["trips", "memberships", "itinerary_days", "travel_segments", "expenses", "transactions", "media", "media_folders", "dining_sessions"]:
        await db[col].delete_many({"trip_id": trip_id})
    return {"ok": True}


@api_router.put("/trips/{trip_id}/storage")
async def set_storage(trip_id: str, body: StorageIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.trips.update_one({"trip_id": trip_id}, {"$set": {"storage_provider": body.dict()}})
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    return {"trip": await enrich_trip(trip)}


@api_router.delete("/trips/{trip_id}/storage")
async def disconnect_storage(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.trips.update_one({"trip_id": trip_id}, {"$set": {"storage_provider": None}})
    return {"ok": True}


@api_router.post("/trips/join")
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
    return {"trip": e, "already_member": False}


@api_router.get("/trips/{trip_id}/members")
async def list_members(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    members = await db.memberships.find({"trip_id": trip_id}, {"_id": 0}).to_list(500)
    out = []
    for m in members:
        pub = await user_public(m["user_id"])
        out.append({**m, **pub})
    return {"members": out}


class AddMemberIn(BaseModel):
    email: EmailStr
    role: str = "member"


@api_router.post("/trips/{trip_id}/members/add")
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
    return {"ok": True, "member": {**await user_public(target["user_id"]), "role": role}}


@api_router.put("/trips/{trip_id}/members/{member_user_id}")
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


@api_router.delete("/trips/{trip_id}/members/{member_user_id}")
async def remove_member(trip_id: str, member_user_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.memberships.delete_one({"trip_id": trip_id, "user_id": member_user_id})
    return {"ok": True}


# ----------------------------- Itinerary -----------------------------
@api_router.get("/trips/{trip_id}/itinerary")
async def get_itinerary(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    days = await db.itinerary_days.find({"trip_id": trip_id}, {"_id": 0}).sort("day_number", 1).to_list(500)
    return {"days": days}


@api_router.post("/trips/{trip_id}/itinerary")
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
    return {"day": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.put("/trips/{trip_id}/itinerary/{day_id}")
async def update_day(trip_id: str, day_id: str, body: DayUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id}, {"$set": update})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    return {"day": day}


@api_router.post("/trips/{trip_id}/itinerary/{day_id}/start")
async def start_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.itinerary_days.update_many({"trip_id": trip_id}, {"$set": {"is_active": False}})
    await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id},
                                       {"$set": {"is_active": True, "started_at": now_utc().isoformat()}})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    return {"day": day}


@api_router.post("/trips/{trip_id}/itinerary/{day_id}/stop")
async def stop_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "admin")
    await db.itinerary_days.update_one({"trip_id": trip_id, "day_id": day_id}, {"$set": {"is_active": False}})
    day = await db.itinerary_days.find_one({"day_id": day_id}, {"_id": 0})
    return {"day": day}


@api_router.delete("/trips/{trip_id}/itinerary/{day_id}")
async def delete_day(trip_id: str, day_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.itinerary_days.delete_one({"trip_id": trip_id, "day_id": day_id})
    return {"ok": True}


# ----------------------------- Travel -----------------------------
@api_router.get("/trips/{trip_id}/travel")
async def get_travel(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    segs = await db.travel_segments.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"segments": segs}


@api_router.post("/trips/{trip_id}/travel")
async def add_travel(trip_id: str, body: TravelIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {"segment_id": new_id("seg"), "trip_id": trip_id, "created_at": now_utc().isoformat(),
           **body.dict()}
    await db.travel_segments.insert_one(doc)
    return {"segment": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.put("/trips/{trip_id}/travel/{segment_id}")
async def update_travel(trip_id: str, segment_id: str, body: TravelIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.travel_segments.update_one({"trip_id": trip_id, "segment_id": segment_id}, {"$set": body.dict()})
    seg = await db.travel_segments.find_one({"segment_id": segment_id}, {"_id": 0})
    return {"segment": seg}


@api_router.delete("/trips/{trip_id}/travel/{segment_id}")
async def delete_travel(trip_id: str, segment_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.travel_segments.delete_one({"trip_id": trip_id, "segment_id": segment_id})
    return {"ok": True}


class ExtractIn(BaseModel):
    file_base64: str
    mime: str = "image/jpeg"


EXTRACT_PROMPT = (
    "You are a travel ticket parser. Read this ticket (flight/train/bus/car) and extract its details. "
    "Return ONLY valid minified JSON (no markdown, no commentary) with EXACTLY this shape: "
    '{"mode":"flight|train|bus|car","provider_name":"","code":"","origin":"","destination":"",'
    '"depart_time":"","arrive_time":"","passengers":[{"name":"","coach":"","seat":"","berth":"","status":"Confirmed"}]}. '
    "Use an empty string for any unknown field. Format depart_time/arrive_time as 'YYYY-MM-DD HH:MM' when present, else ''. "
    "origin/destination should be the station/airport/city names or codes. Infer mode from context."
)


@api_router.post("/trips/{trip_id}/travel/extract")
async def extract_ticket(trip_id: str, body: ExtractIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="AI extraction is not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType
    raw = body.file_base64.split(",", 1)[-1] if body.file_base64.startswith("data:") else body.file_base64
    chat = LlmChat(api_key=key, session_id=f"ticket-{uuid.uuid4().hex}",
                   system_message="You extract structured travel ticket data and reply with pure JSON.")
    tmp_path = None
    try:
        if body.mime == "application/pdf":
            chat.with_model("gemini", "gemini-2.5-flash")
            import base64 as _b64
            tmp_path = f"/tmp/{uuid.uuid4().hex}.pdf"
            with open(tmp_path, "wb") as f:
                f.write(_b64.b64decode(raw))
            content = FileContentWithMimeType(file_path=tmp_path, mime_type="application/pdf")
        else:
            chat.with_model("openai", "gpt-4o")
            content = ImageContent(image_base64=raw)
        msg = UserMessage(text=EXTRACT_PROMPT, file_contents=[content])
        resp = await chat.send_message(msg)
        text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
        try:
            data = json.loads(cleaned)
        except Exception:
            m = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if not m:
                raise HTTPException(status_code=422, detail="Could not read this ticket. Try a clearer image.")
            data = json.loads(m.group(0))
        return {"extracted": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Ticket extraction failed: {e}")
        raise HTTPException(status_code=502, detail="Extraction failed. Please enter details manually.")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass


# ----------------------------- Expenses -----------------------------
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


@api_router.get("/trips/{trip_id}/expenses")
async def get_expenses(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    exps = await db.expenses.find({"trip_id": trip_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return {"expenses": exps}


@api_router.post("/trips/{trip_id}/expenses")
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
    return {"expense": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.put("/trips/{trip_id}/expenses/{expense_id}")
async def update_expense(trip_id: str, expense_id: str, body: ExpenseIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    splits = compute_splits(body)
    update = {
        "title": body.title, "category": body.category, "amount": body.amount,
        "currency": body.currency, "paid_by": body.paid_by, "date": body.date,
        "split_method": body.split_method, "splits": splits, "notes": body.notes,
    }
    await db.expenses.update_one({"trip_id": trip_id, "expense_id": expense_id}, {"$set": update})
    exp = await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    return {"expense": exp}


@api_router.delete("/trips/{trip_id}/expenses/{expense_id}")
async def delete_expense(trip_id: str, expense_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.expenses.delete_one({"trip_id": trip_id, "expense_id": expense_id})
    return {"ok": True}


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


@api_router.get("/trips/{trip_id}/expenses/summary")
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
            "from": debtors[di][0], "from_name": unit_label.get(debtors[di][0], "?"),
            "to": creditors[ci][0], "to_name": unit_label.get(creditors[ci][0], "?"),
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
@api_router.get("/trips/{trip_id}/transactions")
async def get_transactions(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    txns = await db.transactions.find({"trip_id": trip_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    out = []
    for t in txns:
        out.append({**t, "from_name": (await user_public(t["from_user"]))["name"],
                    "to_name": (await user_public(t["to_user"]))["name"]})
    return {"transactions": out}


@api_router.post("/trips/{trip_id}/transactions")
async def add_transaction(trip_id: str, body: TransactionIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {"transaction_id": new_id("txn"), "trip_id": trip_id, "created_at": now_utc().isoformat(),
           "date": body.date or now_utc().isoformat(),
           **{k: v for k, v in body.dict().items() if k != "date"}}
    await db.transactions.insert_one(doc)
    return {"transaction": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.delete("/trips/{trip_id}/transactions/{transaction_id}")
async def delete_transaction(trip_id: str, transaction_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.transactions.delete_one({"trip_id": trip_id, "transaction_id": transaction_id})
    return {"ok": True}


# ----------------------------- Media -----------------------------
@api_router.get("/trips/{trip_id}/folders")
async def get_folders(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    folders = await db.media_folders.find({"trip_id": trip_id}, {"_id": 0}).to_list(500)
    return {"folders": folders}


@api_router.post("/trips/{trip_id}/folders")
async def add_folder(trip_id: str, body: FolderIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {"folder_id": new_id("fld"), "trip_id": trip_id, "name": body.name, "created_at": now_utc().isoformat()}
    await db.media_folders.insert_one(doc)
    return {"folder": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.get("/trips/{trip_id}/media")
async def get_media(trip_id: str, folder_id: Optional[str] = None, uploader_id: Optional[str] = None, user=Depends(get_current_user)):
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


@api_router.post("/trips/{trip_id}/media")
async def add_media(trip_id: str, body: MediaIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    url = body.url
    provider_file_id = None
    storage_provider_name = None
    sp = (trip or {}).get("storage_provider") or {}
    if sp.get("connected"):
        storage_provider_name = sp.get("provider")
        try:
            result = await byos.upload_media_if_byos(trip, body.url, body.type)
            if result:
                url = result["url"]
                provider_file_id = result["provider_file_id"]
        except Exception as e:
            logger.warning(f"BYOS upload failed, storing locally: {e}")
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
    return {"media": {**{k: v for k, v in doc.items() if k != "_id"}, "uploader": await user_public(user["user_id"])}}


@api_router.post("/trips/{trip_id}/media/{media_id}/react")
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
    return {"reactions": reactions}


@api_router.delete("/trips/{trip_id}/media/{media_id}")
async def delete_media(trip_id: str, media_id: str, user=Depends(get_current_user)):
    m = await require_member(trip_id, user)
    media = await db.media.find_one({"trip_id": trip_id, "media_id": media_id}, {"_id": 0})
    if media and (media["uploader_id"] == user["user_id"] or m["role"] == "admin"):
        await db.media.delete_one({"media_id": media_id})
        return {"ok": True}
    raise HTTPException(status_code=403, detail="Cannot delete this media")


# ----------------------------- Restaurant / Dining -----------------------------
@api_router.get("/trips/{trip_id}/dining")
async def get_dining(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    sessions = await db.dining_sessions.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"sessions": sessions}


@api_router.post("/trips/{trip_id}/dining")
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
    return {"session": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.put("/trips/{trip_id}/dining/{session_id}")
async def update_dining(trip_id: str, session_id: str, body: DiningUpdate, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.dining_sessions.update_one({"trip_id": trip_id, "session_id": session_id}, {"$set": update})
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    return {"session": s}


@api_router.post("/trips/{trip_id}/dining/{session_id}/items")
async def add_dining_item(trip_id: str, session_id: str, body: MenuItemIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    item = {"item_id": new_id("item"), **body.dict()}
    await db.dining_sessions.update_one({"trip_id": trip_id, "session_id": session_id}, {"$push": {"items": item}})
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    return {"session": s}


@api_router.delete("/trips/{trip_id}/dining/{session_id}/items/{item_id}")
async def delete_dining_item(trip_id: str, session_id: str, item_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.dining_sessions.update_one({"trip_id": trip_id, "session_id": session_id}, {"$pull": {"items": {"item_id": item_id}}})
    s = await db.dining_sessions.find_one({"session_id": session_id}, {"_id": 0})
    return {"session": s}


@api_router.delete("/trips/{trip_id}/dining/{session_id}")
async def delete_dining(trip_id: str, session_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.dining_sessions.delete_one({"trip_id": trip_id, "session_id": session_id})
    return {"ok": True}


@api_router.get("/trips/{trip_id}/dining/{session_id}/split")
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
    breakdown = []
    for u, food in per_user.items():
        prop = (food / subtotal) if subtotal else 0
        share_extra = extras * prop
        breakdown.append({
            "user_id": u, "name": (await user_public(u))["name"],
            "food": round(food, 2), "extras": round(share_extra, 2), "total": round(food + share_extra, 2),
        })
    breakdown.sort(key=lambda x: -x["total"])
    return {"subtotal": round(subtotal, 2), "tax": round(tax, 2), "tip": round(tip, 2),
            "total": round(total, 2), "breakdown": breakdown}


# ----------------------------- Trip Wrapped -----------------------------
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


@api_router.get("/trips/{trip_id}/wrapped")
async def trip_wrapped(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    trip = await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return await compute_wrapped(trip)


@api_router.post("/trips/{trip_id}/wrapped/share")
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


@api_router.get("/public/wrapped/{share_token}")
async def public_wrapped(share_token: str):
    trip = await db.trips.find_one({"share_token": share_token}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="This recap link is no longer available")
    return await compute_wrapped(trip)


@api_router.get("/")
async def root():
    return {"message": "RoamSync API", "status": "ok"}


app.include_router(api_router)
app.include_router(byos.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.memberships.create_index([("trip_id", 1), ("user_id", 1)])
    await db.trips.create_index("invite_code", unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
