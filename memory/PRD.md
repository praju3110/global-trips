# RoamSync — Product Requirements & Build Log

## Original Problem Statement
Global collaborative Trip Management app (Solo/Group/Family travel). Auth + onboarding, trip dashboard with invite codes, 5-tab trip detail (Itinerary, Travel, Expenses, Media, Restaurant), RBAC, Family Heads, Trip Wrapped analytics. Premium vibrant dark UI.

## Stack (as built)
- Frontend: Expo Router (React Native), TypeScript, react-native-reanimated, expo-blur/image/linear-gradient, custom theme.
- Backend: FastAPI + MongoDB (motor). Replaces requested Firebase/Cloud Run (user approved built-in stack).
- Auth: Unified JWT (email/password) + Emergent-managed Google social login → app JWT.
- Design: "RoamSync" luxe dark mode, coral (#FF6B4A) accents, Outfit/Plus Jakarta Sans fonts.

## User Personas
- Solo traveler: personal itinerary & expense tracking.
- Group organizer (admin): manages members, roles, splits, settles debts.
- Family head: groups dependents into a unit for per-family expense calc.
- Viewer: read-only guest.

## Core Requirements (static)
- Trip types: solo/group/family. RBAC: admin/member/viewer. 8-char invite codes.
- Expenses with 4 split methods + family-head aggregation + settlements + category chart + fun facts.
- Boarding-pass travel UI, collaborative media album, restaurant bill-splitting, Spotify-style Wrapped.

## Implemented (2026-06-22) — MVP COMPLETE, all 5 tabs
- Auth: register/login/me/profile, Google OAuth, secure-store token. ✅
- Trips Dashboard: Upcoming/Past hero cards, create (cover upload/presets, type), join by code. ✅
- Itinerary: timeline, Active Day live banner (pulsing dot + elapsed timer), start/stop, inline edit/add/delete. ✅
- Travel: boarding pass cards (perforated edges, route viz), passengers, add/delete. ✅
- Expenses: Cost Share (balances + settlements, family-head aware), Particulars (split methods, stacked category chart, Fun Facts), Transactions ledger. ✅
- Media: masonry grid, base64 upload, emoji reactions, folders, uploader filter, per-trip storage provider config. ✅
- Restaurant: dining sessions, items (veg/non-veg + who ordered), tax%/tip, per-person split. ✅
- Settings: members, role changes, family-head assignment, invite-code copy, storage (BYOS) config, delete trip. ✅
- Trip Wrapped: animated full-screen story slides with progress bars. ✅
- Backend tested: 25/25 pytest passing. Frontend visually verified + live preview usage.

## Backlog / Next
- P1: True BYOS OAuth upload to Google Drive/OneDrive/iCloud (currently stores references + provider config; actual cloud upload deferred — needs per-provider OAuth credentials).
- P1: Phone OTP login (needs SMS provider keys).
- P2: Ticket PDF parsing/passenger auto-extraction, push to settle reminders, trip cover from camera.
- P2: Real-time collaboration sync, day-level itinerary activities/sub-items.

## Implemented (2026-06-23) — Iteration 2
- **BYOS true cloud upload** (`byos.py`): admin connects Google Drive / OneDrive via OAuth 2.0; encrypted refresh token stored per trip (Fernet); members' media upload into admin's cloud, only references kept. iCloud dropped (no public API). Provider keys are placeholders — set GOOGLE_CLIENT_ID/SECRET & MS_CLIENT_ID/SECRET in backend/.env + add redirect URI to enable. Graceful "Not set up" UI until then. ✅
- **Add members by email**: admin can add an existing RoamSync user directly with a role (`POST /trips/{id}/members/add`), alongside invite codes. ✅
- **AI ticket extraction**: `POST /trips/{id}/travel/extract` parses a ticket image (gpt-4o) or PDF (gemini-2.5-flash) via EMERGENT_LLM_KEY into structured segment + passengers; "Scan ticket to auto-fill" button in Travel tab. ✅
- Backend tested: 37/37 passing (iteration_2). All regressions green.

## Backlog / Next
- P1: Provide Google/Microsoft OAuth keys to activate BYOS uploads end-to-end (infra is ready & plug-and-play).
- P1: Phone OTP login (SMS keys). PDF ticket scan on frontend (currently image scan; API supports PDF).
- P2: "Save Wrapped slide as image" export; Open Graph preview for shared recap links.

## Notes / Mocked
- BYOS OAuth round-trip not yet live (placeholder provider keys); config/start/disconnect verified, no real cloud calls until keys added.
- iCloud Drive intentionally unsupported (Apple has no public third-party Drive upload API).
