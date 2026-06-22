"""RoamSync backend API tests.

Comprehensive test of all endpoints listed in review_request.
Covers: Auth, Trips CRUD, Invite/Join, Members RBAC, Itinerary (start/stop),
Travel, Expenses (all split methods), Transactions, Media (folders/react/delete),
Dining (items/split), Wrapped, RBAC enforcement, Family-trip aggregation.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://journey-hub-377.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


# ----------------------------- Helpers / Fixtures -----------------------------
def _register(name_prefix: str):
    unique = uuid.uuid4().hex[:10]
    email = f"test_{name_prefix}_{unique}@example.com"
    payload = {"email": email, "password": "Passw0rd!", "name": f"TEST_{name_prefix}_{unique}"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": email, "password": "Passw0rd!"}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def users():
    """Create 4 users: admin, member, viewer, extra (for family)."""
    return {
        "admin": _register("admin"),
        "member": _register("member"),
        "viewer": _register("viewer"),
        "extra": _register("extra"),
    }


@pytest.fixture(scope="module")
def group_trip(users):
    """Group trip with admin+member+viewer joined."""
    admin = users["admin"]
    body = {
        "title": "TEST_Group_Goa",
        "destination": "Goa, India",
        "start_date": "2026-06-01T00:00:00+00:00",
        "end_date": "2026-06-10T00:00:00+00:00",
        "trip_type": "group",
    }
    r = requests.post(f"{API}/trips", json=body, headers=_h(admin["token"]))
    assert r.status_code == 200, r.text
    trip = r.json()["trip"]
    invite = trip["invite_code"]
    # member & viewer join
    for who in ("member", "viewer"):
        rj = requests.post(f"{API}/trips/join", json={"invite_code": invite}, headers=_h(users[who]["token"]))
        assert rj.status_code == 200, rj.text
    # demote viewer
    rv = requests.put(
        f"{API}/trips/{trip['trip_id']}/members/{users['viewer']['user']['user_id']}",
        json={"role": "viewer"}, headers=_h(admin["token"]),
    )
    assert rv.status_code == 200
    return trip


@pytest.fixture(scope="module")
def family_trip(users):
    """Family trip: admin (head 1), member (head 2), extra (dependent of member)."""
    admin = users["admin"]
    body = {
        "title": "TEST_Family_Trip",
        "destination": "Manali",
        "start_date": "2026-07-01T00:00:00+00:00",
        "end_date": "2026-07-08T00:00:00+00:00",
        "trip_type": "family",
    }
    r = requests.post(f"{API}/trips", json=body, headers=_h(admin["token"]))
    assert r.status_code == 200
    trip = r.json()["trip"]
    code = trip["invite_code"]
    for who in ("member", "extra"):
        rj = requests.post(f"{API}/trips/join", json={"invite_code": code}, headers=_h(users[who]["token"]))
        assert rj.status_code == 200
    # extra -> family_head_id = member
    rp = requests.put(
        f"{API}/trips/{trip['trip_id']}/members/{users['extra']['user']['user_id']}",
        json={"family_head_id": users["member"]["user"]["user_id"]},
        headers=_h(admin["token"]),
    )
    assert rp.status_code == 200
    return trip


# ----------------------------- Auth -----------------------------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=20)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_register_duplicate(self, users):
        r = requests.post(f"{API}/auth/register", json={
            "email": users["admin"]["email"], "password": "x", "name": "dup"
        })
        assert r.status_code == 400

    def test_login_and_me(self, users):
        admin = users["admin"]
        r = requests.post(f"{API}/auth/login", json={"email": admin["email"], "password": admin["password"]})
        assert r.status_code == 200
        token = r.json()["token"]
        m = requests.get(f"{API}/auth/me", headers=_h(token))
        assert m.status_code == 200
        assert m.json()["user"]["email"] == admin["email"]

    def test_login_invalid(self, users):
        r = requests.post(f"{API}/auth/login", json={"email": users["admin"]["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_update_profile(self, users):
        token = users["admin"]["token"]
        r = requests.put(f"{API}/auth/profile", json={"name": "TEST_Admin_Updated"}, headers=_h(token))
        assert r.status_code == 200
        assert r.json()["user"]["name"] == "TEST_Admin_Updated"


# ----------------------------- Trips & Membership -----------------------------
class TestTrips:
    def test_create_get_list_trip(self, users, group_trip):
        token = users["admin"]["token"]
        tid = group_trip["trip_id"]
        # GET single
        r = requests.get(f"{API}/trips/{tid}", headers=_h(token))
        assert r.status_code == 200
        t = r.json()["trip"]
        assert t["my_role"] == "admin"
        assert t["member_count"] >= 3
        assert t["status"] in ("upcoming", "past")
        assert len(t["invite_code"]) == 8
        # LIST
        rl = requests.get(f"{API}/trips", headers=_h(token))
        assert rl.status_code == 200
        assert any(x["trip_id"] == tid for x in rl.json()["trips"])

    def test_update_trip_admin(self, users, group_trip):
        r = requests.put(f"{API}/trips/{group_trip['trip_id']}", json={"title": "TEST_Group_Goa_Updated"},
                         headers=_h(users["admin"]["token"]))
        assert r.status_code == 200
        assert r.json()["trip"]["title"] == "TEST_Group_Goa_Updated"

    def test_update_trip_viewer_forbidden(self, users, group_trip):
        r = requests.put(f"{API}/trips/{group_trip['trip_id']}", json={"title": "Hack"},
                         headers=_h(users["viewer"]["token"]))
        assert r.status_code == 403

    def test_join_invalid_code(self, users):
        r = requests.post(f"{API}/trips/join", json={"invite_code": "ZZZZZZZZ"},
                          headers=_h(users["extra"]["token"]))
        assert r.status_code == 404

    def test_join_already_member(self, users, group_trip):
        r = requests.post(f"{API}/trips/join", json={"invite_code": group_trip["invite_code"]},
                          headers=_h(users["member"]["token"]))
        assert r.status_code == 200
        assert r.json().get("already_member") is True

    def test_list_members(self, users, group_trip):
        r = requests.get(f"{API}/trips/{group_trip['trip_id']}/members",
                         headers=_h(users["admin"]["token"]))
        assert r.status_code == 200
        mems = r.json()["members"]
        roles = {m["user_id"]: m["role"] for m in mems}
        assert roles[users["admin"]["user"]["user_id"]] == "admin"
        assert roles[users["viewer"]["user"]["user_id"]] == "viewer"

    def test_storage_admin_only(self, users, group_trip):
        body = {"provider": "gdrive", "account_label": "TEST_Drive", "folder_url": "https://drive.example/x"}
        r1 = requests.put(f"{API}/trips/{group_trip['trip_id']}/storage", json=body,
                          headers=_h(users["viewer"]["token"]))
        assert r1.status_code == 403
        r2 = requests.put(f"{API}/trips/{group_trip['trip_id']}/storage", json=body,
                          headers=_h(users["admin"]["token"]))
        assert r2.status_code == 200
        assert r2.json()["trip"]["storage_provider"]["provider"] == "gdrive"


# ----------------------------- Itinerary -----------------------------
class TestItinerary:
    def test_full_itinerary_flow(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin, member, viewer = users["admin"]["token"], users["member"]["token"], users["viewer"]["token"]
        # Viewer cannot create
        r0 = requests.post(f"{API}/trips/{tid}/itinerary", json={"title": "D"}, headers=_h(viewer))
        assert r0.status_code == 403
        # Member can create
        d1 = requests.post(f"{API}/trips/{tid}/itinerary", json={"title": "Day1 Arrival"}, headers=_h(member)).json()["day"]
        d2 = requests.post(f"{API}/trips/{tid}/itinerary", json={"title": "Day2 Beach"}, headers=_h(member)).json()["day"]
        assert d1["day_number"] == 1 and d2["day_number"] == 2
        # GET
        days = requests.get(f"{API}/trips/{tid}/itinerary", headers=_h(member)).json()["days"]
        assert len(days) >= 2
        # Update day
        ru = requests.put(f"{API}/trips/{tid}/itinerary/{d1['day_id']}",
                          json={"description": "Arrival day"}, headers=_h(member))
        assert ru.status_code == 200
        # Start day - viewer forbidden
        rs0 = requests.post(f"{API}/trips/{tid}/itinerary/{d1['day_id']}/start", headers=_h(member))
        assert rs0.status_code == 403  # member also can't (admin only)
        # Admin starts d1
        rs1 = requests.post(f"{API}/trips/{tid}/itinerary/{d1['day_id']}/start", headers=_h(admin))
        assert rs1.status_code == 200
        assert rs1.json()["day"]["is_active"] is True
        # Start d2 -> d1 should auto-deactivate (only one active)
        rs2 = requests.post(f"{API}/trips/{tid}/itinerary/{d2['day_id']}/start", headers=_h(admin))
        assert rs2.status_code == 200
        days_now = requests.get(f"{API}/trips/{tid}/itinerary", headers=_h(member)).json()["days"]
        active = [d for d in days_now if d["is_active"]]
        assert len(active) == 1 and active[0]["day_id"] == d2["day_id"]
        # Stop
        requests.post(f"{API}/trips/{tid}/itinerary/{d2['day_id']}/stop", headers=_h(admin))
        # Delete d2
        rd = requests.delete(f"{API}/trips/{tid}/itinerary/{d2['day_id']}", headers=_h(member))
        assert rd.status_code == 200


# ----------------------------- Travel -----------------------------
class TestTravel:
    def test_travel_crud(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin = users["admin"]["token"]
        body = {
            "mode": "flight", "provider_name": "IndiGo", "code": "6E123",
            "origin": "DEL", "destination": "GOI",
            "passengers": [{"name": "TEST_Admin", "seat": "12A", "status": "Confirmed"}],
        }
        r = requests.post(f"{API}/trips/{tid}/travel", json=body, headers=_h(admin))
        assert r.status_code == 200
        seg = r.json()["segment"]
        assert seg["passengers"][0]["name"] == "TEST_Admin"
        # viewer cannot create
        rv = requests.post(f"{API}/trips/{tid}/travel", json=body, headers=_h(users["viewer"]["token"]))
        assert rv.status_code == 403
        # GET
        gl = requests.get(f"{API}/trips/{tid}/travel", headers=_h(admin)).json()["segments"]
        assert any(s["segment_id"] == seg["segment_id"] for s in gl)
        # PUT
        body2 = {**body, "code": "6E999"}
        ru = requests.put(f"{API}/trips/{tid}/travel/{seg['segment_id']}", json=body2, headers=_h(admin))
        assert ru.status_code == 200 and ru.json()["segment"]["code"] == "6E999"
        # DELETE
        rd = requests.delete(f"{API}/trips/{tid}/travel/{seg['segment_id']}", headers=_h(admin))
        assert rd.status_code == 200


# ----------------------------- Expenses -----------------------------
class TestExpenses:
    def test_split_methods_group(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin_id = users["admin"]["user"]["user_id"]
        member_id = users["member"]["user"]["user_id"]
        viewer_id = users["viewer"]["user"]["user_id"]
        admin = users["admin"]["token"]

        # Equal split: 90 among 3
        e1 = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(admin), json={
            "title": "TEST_Equal", "category": "food", "amount": 90,
            "paid_by": admin_id, "split_method": "equal",
            "participants": [admin_id, member_id, viewer_id],
        }).json()["expense"]
        assert len(e1["splits"]) == 3
        assert all(abs(s["amount"] - 30) < 0.01 for s in e1["splits"])

        # Percentage: 200 -> 50/30/20
        e2 = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(admin), json={
            "title": "TEST_Percent", "category": "stay", "amount": 200,
            "paid_by": member_id, "split_method": "percentage",
            "splits": [
                {"user_id": admin_id, "value": 50},
                {"user_id": member_id, "value": 30},
                {"user_id": viewer_id, "value": 20},
            ],
        }).json()["expense"]
        amts = {s["user_id"]: s["amount"] for s in e2["splits"]}
        assert amts[admin_id] == 100 and amts[member_id] == 60 and amts[viewer_id] == 40

        # Exact: 75 -> 25/25/25
        e3 = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(admin), json={
            "title": "TEST_Exact", "category": "transport", "amount": 75,
            "paid_by": viewer_id, "split_method": "exact",
            "splits": [
                {"user_id": admin_id, "value": 25},
                {"user_id": member_id, "value": 25},
                {"user_id": viewer_id, "value": 25},
            ],
        }).json()["expense"]
        amts3 = {s["user_id"]: s["amount"] for s in e3["splits"]}
        assert amts3[admin_id] == 25

        # Shares: 100 with shares 2:1:1 -> 50/25/25
        e4 = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(admin), json={
            "title": "TEST_Shares", "category": "food", "amount": 100,
            "paid_by": admin_id, "split_method": "shares",
            "splits": [
                {"user_id": admin_id, "value": 2},
                {"user_id": member_id, "value": 1},
                {"user_id": viewer_id, "value": 1},
            ],
        }).json()["expense"]
        a = {s["user_id"]: s["amount"] for s in e4["splits"]}
        assert a[admin_id] == 50 and a[member_id] == 25 and a[viewer_id] == 25

        # GET list
        gl = requests.get(f"{API}/trips/{tid}/expenses", headers=_h(admin)).json()["expenses"]
        assert len(gl) >= 4

        # Summary (group)
        sm = requests.get(f"{API}/trips/{tid}/expenses/summary", headers=_h(admin)).json()
        assert sm["trip_type"] == "group"
        assert sm["total_spent"] == 465.0  # 90+200+75+100
        assert "food" in sm["category_totals"]
        assert sm["category_totals"]["food"] == 190
        assert isinstance(sm["settlements"], list)
        assert isinstance(sm["balances"], list) and len(sm["balances"]) == 3
        # Net balances should sum ~ 0
        assert abs(sum(b["net"] for b in sm["balances"])) < 0.05
        assert sm["fun_facts"]["expense_count"] >= 4

        # Viewer cannot create
        rv = requests.post(f"{API}/trips/{tid}/expenses", headers=_h(users["viewer"]["token"]), json={
            "title": "X", "amount": 1, "paid_by": viewer_id, "split_method": "equal", "participants": [viewer_id],
        })
        assert rv.status_code == 403

        # Delete one
        rd = requests.delete(f"{API}/trips/{tid}/expenses/{e1['expense_id']}", headers=_h(admin))
        assert rd.status_code == 200

    def test_family_aggregation(self, users, family_trip):
        tid = family_trip["trip_id"]
        admin = users["admin"]["token"]
        admin_id = users["admin"]["user"]["user_id"]
        member_id = users["member"]["user"]["user_id"]
        extra_id = users["extra"]["user"]["user_id"]  # under member's family

        # admin pays 300, split equally among 3 individuals (admin/member/extra) -> 100 each
        requests.post(f"{API}/trips/{tid}/expenses", headers=_h(admin), json={
            "title": "TEST_FamEq", "category": "food", "amount": 300,
            "paid_by": admin_id, "split_method": "equal",
            "participants": [admin_id, member_id, extra_id],
        })
        sm = requests.get(f"{API}/trips/{tid}/expenses/summary", headers=_h(admin)).json()
        assert sm["trip_type"] == "family"
        # Units: admin (alone) and member (with extra). 2 balance rows
        units = {b["unit_id"]: b["net"] for b in sm["balances"]}
        assert len(units) == 2
        # admin paid 300, owes 100 of his own share -> +200
        # member unit owes 200 (100 member + 100 extra) -> -200
        assert abs(units[admin_id] - 200) < 0.05
        assert abs(units[member_id] - (-200)) < 0.05


# ----------------------------- Transactions -----------------------------
class TestTransactions:
    def test_transactions_reduce_balance(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin = users["admin"]["token"]
        admin_id = users["admin"]["user"]["user_id"]
        member_id = users["member"]["user"]["user_id"]

        # Baseline summary
        before = requests.get(f"{API}/trips/{tid}/expenses/summary", headers=_h(admin)).json()
        bal_before = {b["unit_id"]: b["net"] for b in before["balances"]}

        # Member pays admin 50
        rt = requests.post(f"{API}/trips/{tid}/transactions", headers=_h(admin), json={
            "from_user": member_id, "to_user": admin_id, "amount": 50, "note": "TEST_settle",
        })
        assert rt.status_code == 200
        txn_id = rt.json()["transaction"]["transaction_id"]

        gl = requests.get(f"{API}/trips/{tid}/transactions", headers=_h(admin)).json()["transactions"]
        assert any(t["transaction_id"] == txn_id for t in gl)
        assert gl[0]["from_name"] and gl[0]["to_name"]

        after = requests.get(f"{API}/trips/{tid}/expenses/summary", headers=_h(admin)).json()
        bal_after = {b["unit_id"]: b["net"] for b in after["balances"]}
        # member's balance should increase by 50 (they paid -> they owe less), admin's should decrease by 50
        assert abs((bal_after[member_id] - bal_before[member_id]) - 50) < 0.05
        assert abs((bal_after[admin_id] - bal_before[admin_id]) - (-50)) < 0.05

        # delete txn
        rd = requests.delete(f"{API}/trips/{tid}/transactions/{txn_id}", headers=_h(admin))
        assert rd.status_code == 200


# ----------------------------- Media -----------------------------
class TestMedia:
    def test_folders_and_media(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin = users["admin"]["token"]
        member = users["member"]["token"]
        viewer = users["viewer"]["token"]

        # Folder
        rf = requests.post(f"{API}/trips/{tid}/folders", headers=_h(admin), json={"name": "TEST_Beach"})
        assert rf.status_code == 200
        fid = rf.json()["folder"]["folder_id"]
        assert any(f["folder_id"] == fid for f in requests.get(f"{API}/trips/{tid}/folders", headers=_h(admin)).json()["folders"])

        # Viewer can't post folder
        rvf = requests.post(f"{API}/trips/{tid}/folders", headers=_h(viewer), json={"name": "X"})
        assert rvf.status_code == 403

        # Upload media (admin)
        url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZjfFhsAAAAASUVORK5CYII="
        rm1 = requests.post(f"{API}/trips/{tid}/media", headers=_h(admin),
                            json={"folder_id": fid, "type": "photo", "url": url, "caption": "TEST_a"})
        assert rm1.status_code == 200
        m1 = rm1.json()["media"]
        # Member upload
        rm2 = requests.post(f"{API}/trips/{tid}/media", headers=_h(member),
                            json={"folder_id": fid, "type": "photo", "url": url, "caption": "TEST_b"})
        m2 = rm2.json()["media"]
        # Viewer cannot
        assert requests.post(f"{API}/trips/{tid}/media", headers=_h(viewer),
                             json={"folder_id": fid, "type": "photo", "url": url}).status_code == 403

        # Filter by uploader
        member_id = users["member"]["user"]["user_id"]
        flt = requests.get(f"{API}/trips/{tid}/media", headers=_h(admin),
                           params={"uploader_id": member_id}).json()["media"]
        assert all(it["uploader_id"] == member_id for it in flt)
        assert any(it["media_id"] == m2["media_id"] for it in flt)

        # React (toggle)
        rr = requests.post(f"{API}/trips/{tid}/media/{m1['media_id']}/react",
                           headers=_h(member), json={"emoji": "❤️"})
        assert rr.status_code == 200 and users["member"]["user"]["user_id"] in rr.json()["reactions"]["❤️"]
        rr2 = requests.post(f"{API}/trips/{tid}/media/{m1['media_id']}/react",
                            headers=_h(member), json={"emoji": "❤️"})
        assert "❤️" not in rr2.json()["reactions"]  # toggled off

        # Delete: viewer can't delete others'
        rdv = requests.delete(f"{API}/trips/{tid}/media/{m1['media_id']}", headers=_h(viewer))
        assert rdv.status_code == 403
        # Member can delete own
        rdm = requests.delete(f"{API}/trips/{tid}/media/{m2['media_id']}", headers=_h(member))
        assert rdm.status_code == 200
        # Admin can delete anyone's
        rda = requests.delete(f"{API}/trips/{tid}/media/{m1['media_id']}", headers=_h(admin))
        assert rda.status_code == 200


# ----------------------------- Dining -----------------------------
class TestDining:
    def test_dining_split(self, users, group_trip):
        tid = group_trip["trip_id"]
        admin = users["admin"]["token"]
        admin_id = users["admin"]["user"]["user_id"]
        member_id = users["member"]["user"]["user_id"]
        viewer_id = users["viewer"]["user"]["user_id"]

        rc = requests.post(f"{API}/trips/{tid}/dining", headers=_h(admin),
                           json={"restaurant_name": "TEST_Cafe", "tax_percent": 10, "tip_amount": 5})
        assert rc.status_code == 200
        sid = rc.json()["session"]["session_id"]

        # Add items
        i1 = requests.post(f"{API}/trips/{tid}/dining/{sid}/items", headers=_h(admin), json={
            "name": "Pizza", "price": 20, "veg": True, "ordered_by": [admin_id, member_id]
        }).json()["session"]["items"][0]
        requests.post(f"{API}/trips/{tid}/dining/{sid}/items", headers=_h(admin), json={
            "name": "Burger", "price": 10, "veg": False, "ordered_by": [viewer_id]
        })

        sp = requests.get(f"{API}/trips/{tid}/dining/{sid}/split", headers=_h(admin)).json()
        assert sp["subtotal"] == 30
        assert sp["tax"] == 3.0
        assert sp["tip"] == 5
        assert sp["total"] == 38
        # admin: 10 food, member: 10 food, viewer: 10 food
        food_map = {b["user_id"]: b["food"] for b in sp["breakdown"]}
        assert food_map[admin_id] == 10 and food_map[member_id] == 10 and food_map[viewer_id] == 10
        # totals sum ~ 38
        assert abs(sum(b["total"] for b in sp["breakdown"]) - 38) < 0.1

        # Update tax
        ru = requests.put(f"{API}/trips/{tid}/dining/{sid}", headers=_h(admin),
                          json={"tax_percent": 20, "status": "closed"})
        assert ru.status_code == 200
        assert ru.json()["session"]["tax_percent"] == 20

        # Delete item
        rdi = requests.delete(f"{API}/trips/{tid}/dining/{sid}/items/{i1['item_id']}", headers=_h(admin))
        assert rdi.status_code == 200
        # Delete session
        rds = requests.delete(f"{API}/trips/{tid}/dining/{sid}", headers=_h(admin))
        assert rds.status_code == 200


# ----------------------------- Wrapped -----------------------------
class TestWrapped:
    def test_wrapped(self, users, group_trip):
        tid = group_trip["trip_id"]
        r = requests.get(f"{API}/trips/{tid}/wrapped", headers=_h(users["admin"]["token"]))
        assert r.status_code == 200
        w = r.json()
        for k in ("trip_title", "total_spent", "num_days", "num_members", "num_photos", "num_expenses"):
            assert k in w
        assert w["num_members"] >= 3


# ----------------------------- RBAC: viewer + non-member access -----------------------------
class TestRBAC:
    def test_non_member_cannot_access(self, users, group_trip):
        # extra is not in group_trip
        r = requests.get(f"{API}/trips/{group_trip['trip_id']}", headers=_h(users["extra"]["token"]))
        assert r.status_code == 403

    def test_member_cannot_manage_members(self, users, group_trip):
        r = requests.put(
            f"{API}/trips/{group_trip['trip_id']}/members/{users['viewer']['user']['user_id']}",
            json={"role": "admin"}, headers=_h(users["member"]["token"]),
        )
        assert r.status_code == 403

    def test_member_cannot_delete_trip(self, users, group_trip):
        r = requests.delete(f"{API}/trips/{group_trip['trip_id']}", headers=_h(users["member"]["token"]))
        assert r.status_code == 403


# ----------------------------- Cleanup -----------------------------
class TestZZ_Cleanup:
    """Run last (Z prefix) to delete trips created in tests."""
    def test_delete_trips(self, users, group_trip, family_trip):
        for tid in (group_trip["trip_id"], family_trip["trip_id"]):
            r = requests.delete(f"{API}/trips/{tid}", headers=_h(users["admin"]["token"]))
            assert r.status_code == 200
        # Verify gone
        r2 = requests.get(f"{API}/trips/{group_trip['trip_id']}", headers=_h(users["admin"]["token"]))
        assert r2.status_code == 403  # no membership left
