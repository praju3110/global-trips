"""Tests for new RoamSync features (iteration 2):
 - BYOS config / start (no real keys) / disconnect storage
 - Admin add-member-by-email
 - AI ticket extraction via EMERGENT_LLM_KEY
 - Regression: media POST stores base64 url when no BYOS connected
"""
import os
import io
import uuid
import base64
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://journey-hub-377.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(prefix):
    unique = uuid.uuid4().hex[:10]
    email = f"test_{prefix}_{unique}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": f"TEST_{prefix}",
    }, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "email": email}


@pytest.fixture(scope="module")
def admin_user():
    return _register("admin2")


@pytest.fixture(scope="module")
def friend_user():
    return _register("friend2")


@pytest.fixture(scope="module")
def viewer_user():
    return _register("viewer2")


@pytest.fixture(scope="module")
def trip(admin_user, viewer_user):
    body = {
        "title": "TEST_BYOS_Trip",
        "destination": "Paris",
        "start_date": "2026-09-01T00:00:00+00:00",
        "end_date": "2026-09-10T00:00:00+00:00",
        "trip_type": "group",
    }
    r = requests.post(f"{API}/trips", json=body, headers=_h(admin_user["token"]))
    assert r.status_code == 200, r.text
    t = r.json()["trip"]
    # viewer joins as member and gets demoted to viewer
    rj = requests.post(f"{API}/trips/join", json={"invite_code": t["invite_code"]},
                       headers=_h(viewer_user["token"]))
    assert rj.status_code == 200
    rp = requests.put(f"{API}/trips/{t['trip_id']}/members/{viewer_user['user']['user_id']}",
                      json={"role": "viewer"}, headers=_h(admin_user["token"]))
    assert rp.status_code == 200
    yield t
    requests.delete(f"{API}/trips/{t['trip_id']}", headers=_h(admin_user["token"]))


# ----------------------------- BYOS -----------------------------
class TestBYOS:
    def test_config_lists_both_providers_unconfigured(self, admin_user):
        # /config is unauthenticated per router definition
        r = requests.get(f"{API}/byos/config", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        keys = {p["key"]: p for p in data["providers"]}
        assert "gdrive" in keys and "onedrive" in keys
        # Placeholder env keys → configured:false
        assert keys["gdrive"]["configured"] is False
        assert keys["onedrive"]["configured"] is False
        assert keys["gdrive"]["label"] == "Google Drive"
        assert keys["onedrive"]["label"] == "OneDrive"

    def test_start_unconfigured_returns_400_not_500(self, admin_user, trip):
        # admin with valid token, but provider not configured
        r = requests.get(f"{API}/byos/gdrive/start", params={
            "trip_id": trip["trip_id"], "token": admin_user["token"], "client_redirect": ""
        }, allow_redirects=False, timeout=20)
        # Should NOT 500. Expect 400 (not configured)
        assert r.status_code != 500, f"Got 500: {r.text}"
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "not configured" in r.text.lower()

    def test_start_invalid_token_returns_400_not_configured_first(self, trip):
        # Implementation checks provider_configured BEFORE token, so even invalid token → 400
        r = requests.get(f"{API}/byos/gdrive/start", params={
            "trip_id": trip["trip_id"], "token": "garbage", "client_redirect": ""
        }, allow_redirects=False, timeout=20)
        assert r.status_code != 500
        # Either 400 (not configured) or 401 (invalid token) - per request: should NOT 500
        assert r.status_code in (400, 401)

    def test_start_unknown_provider_returns_404(self, admin_user, trip):
        r = requests.get(f"{API}/byos/bogus/start", params={
            "trip_id": trip["trip_id"], "token": admin_user["token"]
        }, allow_redirects=False, timeout=20)
        assert r.status_code == 404

    def test_disconnect_storage_admin(self, admin_user, viewer_user, friend_user, trip):
        tid = trip["trip_id"]
        # First connect via legacy PUT /storage (no OAuth)
        rp = requests.put(f"{API}/trips/{tid}/storage", headers=_h(admin_user["token"]),
                          json={"provider": "gdrive", "account_label": "TEST_Drive"})
        assert rp.status_code == 200

        # viewer forbidden
        rv = requests.delete(f"{API}/trips/{tid}/storage", headers=_h(viewer_user["token"]))
        assert rv.status_code == 403

        # friend (non-member) forbidden
        rf = requests.delete(f"{API}/trips/{tid}/storage", headers=_h(friend_user["token"]))
        assert rf.status_code == 403

        # admin succeeds
        ra = requests.delete(f"{API}/trips/{tid}/storage", headers=_h(admin_user["token"]))
        assert ra.status_code == 200
        assert ra.json().get("ok") is True

        # Verify cleared
        g = requests.get(f"{API}/trips/{tid}", headers=_h(admin_user["token"]))
        assert g.json()["trip"].get("storage_provider") in (None, {})


# ----------------------------- Add member by email -----------------------------
class TestAddMemberByEmail:
    def test_add_existing_user_as_member(self, admin_user, friend_user, trip):
        tid = trip["trip_id"]
        r = requests.post(f"{API}/trips/{tid}/members/add", headers=_h(admin_user["token"]),
                          json={"email": friend_user["email"], "role": "member"})
        assert r.status_code == 200, r.text
        assert r.json()["member"]["role"] == "member"
        # Verify via list
        lm = requests.get(f"{API}/trips/{tid}/members", headers=_h(admin_user["token"])).json()["members"]
        ids = {m["user_id"]: m["role"] for m in lm}
        assert ids.get(friend_user["user"]["user_id"]) == "member"

    def test_add_already_member_400(self, admin_user, friend_user, trip):
        r = requests.post(f"{API}/trips/{trip['trip_id']}/members/add",
                          headers=_h(admin_user["token"]),
                          json={"email": friend_user["email"], "role": "member"})
        assert r.status_code == 400

    def test_add_unknown_email_404(self, admin_user, trip):
        r = requests.post(f"{API}/trips/{trip['trip_id']}/members/add",
                          headers=_h(admin_user["token"]),
                          json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com", "role": "member"})
        assert r.status_code == 404

    def test_non_admin_forbidden(self, friend_user, trip):
        # friend is now a member (from first test) — should be 403 to add
        r = requests.post(f"{API}/trips/{trip['trip_id']}/members/add",
                          headers=_h(friend_user["token"]),
                          json={"email": "x@example.com", "role": "member"})
        assert r.status_code == 403


# ----------------------------- Ticket extraction (AI) -----------------------------
def _make_boarding_pass_b64() -> str:
    """Generate a synthetic boarding-pass JPEG with visible text."""
    img = Image.new("RGB", (900, 380), color=(245, 248, 252))
    d = ImageDraw.Draw(img)
    # Add some texture variance for the rule about no uniform images
    for x in range(0, 900, 18):
        d.line([(x, 0), (x, 380)], fill=(230, 235, 240), width=1)
    try:
        font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
        font_med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    except Exception:
        font_big = font_med = font_sm = ImageFont.load_default()

    d.rectangle([(0, 0), (900, 60)], fill=(20, 90, 170))
    d.text((20, 12), "INDIGO  BOARDING PASS", fill=(255, 255, 255), font=font_big)

    d.text((20, 90),  "Passenger:  JOHN DOE",          fill=(20, 20, 20), font=font_med)
    d.text((20, 130), "Flight:  6E-235",                fill=(20, 20, 20), font=font_med)
    d.text((20, 170), "FROM:  DEL  (New Delhi)",        fill=(20, 20, 20), font=font_med)
    d.text((20, 210), "TO:    BOM  (Mumbai)",           fill=(20, 20, 20), font=font_med)
    d.text((20, 250), "Departure: 2026-03-12 09:45",    fill=(20, 20, 20), font=font_sm)
    d.text((20, 280), "Arrival:   2026-03-12 11:55",    fill=(20, 20, 20), font=font_sm)
    d.text((20, 310), "Seat: 14C    Gate: B7    Class: Economy", fill=(20, 20, 20), font=font_sm)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode()


class TestTicketExtraction:
    def test_extract_boarding_pass(self, admin_user, trip):
        b64 = _make_boarding_pass_b64()
        r = requests.post(f"{API}/trips/{trip['trip_id']}/travel/extract",
                          headers=_h(admin_user["token"]),
                          json={"file_base64": b64, "mime": "image/jpeg"},
                          timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        ex = r.json().get("extracted")
        assert isinstance(ex, dict), f"extracted not a dict: {ex}"
        assert "mode" in ex
        # Mode should be flight (or at least non-empty)
        assert ex.get("mode") in ("flight", "train", "bus", "car"), f"bad mode: {ex.get('mode')}"
        # At least one of origin/destination/provider should be populated
        populated = any([
            ex.get("origin", "").strip(),
            ex.get("destination", "").strip(),
            ex.get("provider_name", "").strip(),
            ex.get("code", "").strip(),
        ])
        assert populated, f"No core fields populated: {ex}"


# ----------------------------- Regression: media POST without BYOS -----------------------------
class TestMediaRegressionNoBYOS:
    def test_media_post_stores_base64_when_no_byos(self, admin_user, trip):
        tid = trip["trip_id"]
        # Confirm no storage connected
        g = requests.get(f"{API}/trips/{tid}", headers=_h(admin_user["token"]))
        assert (g.json()["trip"].get("storage_provider") or {}).get("connected") is not True

        data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZjfFhsAAAAASUVORK5CYII="
        r = requests.post(f"{API}/trips/{tid}/media", headers=_h(admin_user["token"]),
                          json={"type": "photo", "url": data_uri, "caption": "TEST_regression"})
        assert r.status_code == 200
        m = r.json()["media"]
        # When no BYOS connected, the url is stored as-is
        assert m["url"].startswith("data:image/"), f"url not base64: {m['url'][:50]}"
        assert m.get("storage_provider") in (None, "")
        assert m.get("provider_file_id") in (None, "")

    def test_trip_expense_itinerary_endpoints_still_200(self, admin_user, trip):
        tid = trip["trip_id"]
        token = admin_user["token"]
        # GET trip
        assert requests.get(f"{API}/trips/{tid}", headers=_h(token)).status_code == 200
        # GET itinerary
        assert requests.get(f"{API}/trips/{tid}/itinerary", headers=_h(token)).status_code == 200
        # POST itinerary day
        assert requests.post(f"{API}/trips/{tid}/itinerary", headers=_h(token),
                             json={"title": "TEST_day"}).status_code == 200
        # POST expense
        admin_id = admin_user["user"]["user_id"]
        e = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(token), json={
            "title": "TEST_reg_exp", "amount": 12, "paid_by": admin_id,
            "split_method": "equal", "participants": [admin_id],
        })
        assert e.status_code == 200
        # GET expenses
        assert requests.get(f"{API}/trips/{tid}/expenses", headers=_h(token)).status_code == 200
        # Summary
        assert requests.get(f"{API}/trips/{tid}/expenses/summary", headers=_h(token)).status_code == 200
