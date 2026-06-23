"""Travel routes — boarding passes, AI extraction."""
import json
import logging
import os
import re
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_member, new_id, now_utc
from app.config import EMERGENT_LLM_KEY
from app.db import db
from app.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
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


# ----------------------------- Routes -----------------------------
@router.get("/trips/{trip_id}/travel")
async def get_travel(trip_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user)
    segs = await db.travel_segments.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"segments": segs}


@router.post("/trips/{trip_id}/travel")
async def add_travel(trip_id: str, body: TravelIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    doc = {
        "segment_id": new_id("seg"),
        "trip_id": trip_id,
        "created_at": now_utc().isoformat(),
        **body.dict()
    }
    await db.travel_segments.insert_one(doc)
    await manager.broadcast(trip_id, {"type": "travel_updated"})
    return {"segment": {k: v for k, v in doc.items() if k != "_id"}}


@router.put("/trips/{trip_id}/travel/{segment_id}")
async def update_travel(trip_id: str, segment_id: str, body: TravelIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.travel_segments.update_one(
        {"trip_id": trip_id, "segment_id": segment_id},
        {"$set": body.dict()}
    )
    seg = await db.travel_segments.find_one({"segment_id": segment_id}, {"_id": 0})
    await manager.broadcast(trip_id, {"type": "travel_updated"})
    return {"segment": seg}


@router.delete("/trips/{trip_id}/travel/{segment_id}")
async def delete_travel(trip_id: str, segment_id: str, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    await db.travel_segments.delete_one({"trip_id": trip_id, "segment_id": segment_id})
    await manager.broadcast(trip_id, {"type": "travel_updated"})
    return {"ok": True}


@router.post("/trips/{trip_id}/travel/extract")
async def extract_ticket(trip_id: str, body: ExtractIn, user=Depends(get_current_user)):
    await require_member(trip_id, user, "member")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=400, detail="AI extraction is not configured")
    
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType
    raw = body.file_base64.split(",", 1)[-1] if body.file_base64.startswith("data:") else body.file_base64
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ticket-{uuid.uuid4().hex}",
        system_message="You extract structured travel ticket data and reply with pure JSON."
    )
    tmp_path = None
    try:
        if body.mime == "application/pdf":
            chat.with_model("gemini", "gemini-2.5-flash")
            import base64 as _b64
            tmp_path = f"/tmp/{uuid.uuid4().hex}.pdf"
            os.makedirs("/tmp", exist_ok=True)
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
