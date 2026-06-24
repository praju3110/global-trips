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


class TicketFile(BaseModel):
    file_base64: str
    mime: str = "image/jpeg"


class ExtractIn(BaseModel):
    files: Optional[List[TicketFile]] = None
    file_base64: Optional[str] = None
    mime: Optional[str] = "image/jpeg"


EXTRACT_PROMPT = (
    "You are an expert travel ticket parser. Read the attached tickets (which may be images or PDFs) and extract their details. "
    "Some tickets might belong to the same travel segment (e.g., same carrier/train number, origin, destination, and depart date). "
    "Group tickets of the same segment together, merging their passenger list (ensuring no duplicate passenger names within the same segment). "
    "For tickets of different segments (e.g. outbound and return tickets, different carriers, or different dates), create separate segments. "
    "Return a JSON object containing an array of segments in the 'segments' key. "
    "Return ONLY valid minified JSON (no markdown, no commentary) with EXACTLY this shape:\n"
    '{"segments": [{"mode":"flight|train|bus|car","provider_name":"","code":"","origin":"","destination":"",'
    '"depart_time":"","arrive_time":"","passengers":[{"name":"","coach":"","seat":"","berth":"","status":"Confirmed"}]}]}. '
    "Use empty strings for any unknown fields. Format depart_time and arrive_time as 'YYYY-MM-DD HH:MM' when present. "
    "Ensure origin/destination are airport/station codes or names."
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
    
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is not configured")
    
    files_to_process = []
    if body.files:
        files_to_process = body.files
    elif body.file_base64:
        files_to_process = [TicketFile(file_base64=body.file_base64, mime=body.mime)]
        
    if not files_to_process:
        raise HTTPException(status_code=400, detail="No files provided for extraction")
    
    import base64 as _b64
    
    try:
        try:
            # Try official modern google-genai SDK first
            from google import genai
            from google.genai import types
            
            client = genai.Client(api_key=api_key)
            contents = []
            for f in files_to_process:
                raw = f.file_base64.split(",", 1)[-1] if f.file_base64.startswith("data:") else f.file_base64
                raw_bytes = _b64.b64decode(raw)
                contents.append(
                    types.Part.from_bytes(
                        data=raw_bytes,
                        mime_type=f.mime,
                    )
                )
            contents.append(EXTRACT_PROMPT)
            
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents
            )
            text = response.text
        except ImportError:
            # Fall back to legacy google-generativeai
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=api_key)
            model = legacy_genai.GenerativeModel('gemini-2.5-flash')
            
            legacy_contents = []
            for f in files_to_process:
                raw = f.file_base64.split(",", 1)[-1] if f.file_base64.startswith("data:") else f.file_base64
                raw_bytes = _b64.b64decode(raw)
                legacy_contents.append({
                    'mime_type': f.mime,
                    'data': raw_bytes
                })
            legacy_contents.append(EXTRACT_PROMPT)
            
            response = model.generate_content(legacy_contents)
            text = response.text
        
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
        try:
            data = json.loads(cleaned)
        except Exception:
            m = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if not m:
                raise HTTPException(status_code=422, detail="Could not read this ticket. Try a clearer image or PDF.")
            data = json.loads(m.group(0))
            
        # Standardize return format: ensure we always return a list of segments
        extracted_segments = []
        if isinstance(data, dict):
            if "segments" in data:
                extracted_segments = data["segments"]
            elif "mode" in data:
                extracted_segments = [data]
        elif isinstance(data, list):
            extracted_segments = data
            
        extracted_dict = extracted_segments[0] if extracted_segments else {}
        return {"extracted": extracted_dict}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Ticket extraction failed: {e}")
        raise HTTPException(status_code=502, detail=f"Extraction failed: {str(e)}")

