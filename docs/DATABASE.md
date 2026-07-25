# Database

## Cluster & database
- **Cluster:** RG ERP's MongoDB Atlas cluster — `retailgrid0.vzpoiol.mongodb.net` (replica set `atlas-xaje91-shard-0`).
- **Database:** `whatslocal2_0` — **its own database**, fully isolated from RG ERP's `RetailGridDB`. RG ERP data is never read or written by this project.
- **Why `whatslocal2_0` and not `whatslocal2.0`:** MongoDB forbids `.` in database names (it's the `db.collection` namespace separator). The on-disk folder is `whatslocal2.0`; the DB is `whatslocal2_0`.
- **Connection:** reuse the same Atlas credentials as RG ERP (live URI in `retailgrid/RetailGrid ERP/apps/backend/.env`), only swapping the db name to `whatslocal2_0`.

## Collections
| Collection | Purpose | Status |
|---|---|---|
| `details` | Global setup / configuration | Created 2026-06-21 |
| `events` | Analytics events (see [ANALYTICS.md](ANALYTICS.md)) | ACTIVE 2026-06-21 |
| `tags` | Keyword dictionary (controlled, many-to-many) | PLANNED |
| `listings` | Every business/service/job listing | PLANNED |
| `users` | Admin (+ future listers); bcrypt password, `role` | ACTIVE 2026-06-21 |
| `tags` | Keyword dictionary (controlled, approved flag) | ACTIVE 2026-06-22 (57 seeded) |
| `listings` | Business/job listings; phone server-only; text-indexed | ACTIVE 2026-06-22 |
| `reveals` | Phone-reveal log for per-visitor/day metering | ACTIVE 2026-06-22 |
| `reports` | User reports against listings (reason + details) | ACTIVE 2026-06-22 |
| `mod_actions` | Admin moderation audit log (hide/show/restrict/reviewed) | ACTIVE 2026-06-23 |
| `app_config` | Admin config incl. `home_sequence` (section order) | ACTIVE 2026-06-23 |
| `cities` | Approved cities/pincodes (city, district, state) | PLANNED |
| `pincodes` | Cached pin → city/district/state/localities (read-through cache over India Post) | ACTIVE 2026-07-06 |
| `wards` / `complaints` / `complaint_comments` / `agencies` | Ward Complaints (see [COMPLAINTS.md](COMPLAINTS.md)) | ACTIVE |
| `bodies` | Local bodies (municipal towns / gram panchayats) — name, taluka, type, pincodes[]; wards belong to one, unique by (city, body, number) | ACTIVE 2026-07-06 |

**Uploaded photos are files, not DB docs:** only the photo **key** (`p`+16 hex) is stored in `listing.photos[]`; the compressed `view`/`thumb` JPEGs live on disk under `/var/www/whatslocal-media/<key>/` (EXIF/GPS stripped). Share cards live under `/var/www/whatslocal-og/`. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Tags model (handling 100s of categories — DECIDED: tags, not categories)
**Principle: classification is DATA, not code, and many-to-many.** A listing carries multiple tags at once (a doctor = `doctor` + `hospital` + `cardiologist` + …). Adding the 200th tag is a data insert, never a code change.

**Controlled (curated) tags, NOT free-typed.** Users pick tags from a canonical dictionary via type-ahead. If a needed tag doesn't exist, it's submitted as a *requested tag* and goes through the same admin **approval** flow as listings. This gives tag flexibility without tag chaos (no `cardiologist`/`Cardiologist`/`heart dr` duplicates).

```
tags
  _id
  name        "Cardiologist"
  slug        "cardiologist"
  synonyms    ["heart doctor", "heart specialist"]   (search matching)
  kind        "business" | "job"
  group       "Health"        (optional — for browse/landing pages, not a rigid tree)
  approved    true|false       (false = user-requested, awaiting admin)
  sort_order

listings
  _id, title, tag_ids: [ObjectId, ...] (1–10), primary_tag_id?, ...
```

- **UI label = "Keywords"** (NOT "tags" — users don't understand "tags"). Data model stays `tags`.
- A listing has **1–10 keywords** (min 1 mandatory, max 10).
- **Search term = title + keywords + synonyms + description.**
- **Smart suggestions (relational/co-occurrence):** after the lister picks 2–3 keywords, suggest more keywords that frequently co-occur with them on existing approved listings (e.g. cardiologist+doctor → suggest hospital, clinic, physician). Maintain a related-keyword co-occurrence map, refreshed on listing approval.
- **New keyword = admin approval.** A lister can request a keyword not in the dictionary; it stays `approved:false` (hidden) until the owner approves it — same queue as listings.

## Listing fields
Mandatory to post (★): **title, mobile number, pincode, ≥1 keyword (max 10)**.

| Field | ★ | Notes |
|---|---|---|
| title | ★ | Business / person / service name |
| mobile | ★ | Primary contact |
| pincode | ★ | Resolves city/district/state via RG resolver |
| keywords (tag_ids) | ★ | 1–10 |
| whatsapp | | separate WhatsApp number; "Same as calling" mirrors the contact mobile |
| address / area | | Within resolved city |
| description | | Free text; also searched |
| photos | | `p`+16-hex keys (≤8); files on disk, EXIF stripped; `photos[0]` = cover |
| hours / week_hours | | Open/close, per-day schedule |
| alt_phone, email, website | | |
| location (lat/lng) | | "Get directions" |
| hide_number | | Fully-private contact (Happening news/info) — never exposed; see [PRIVACY.md](PRIVACY.md) |

**Ranking/index fields (internal, never public):** `views` (popularity), `search_blob`/`search_norm` (denormalized search text — substring matching), `keywords_cache`, plus audit fields. Balanced browse/home ranking reads `views`+`createdAt`; text search reads `search_norm`. See [ARCHITECTURE.md](ARCHITECTURE.md) Ranking.

## Search engine — Atlas Search
- Use **Atlas Search** (Lucene; included with Atlas) for the city search bar: typo tolerance, relevance ranking, synonyms, one query across title+keywords+description.
- Fallback if a cluster tier lacks Atlas Search: Mongo `$text` index + synonym expansion (works, less fuzzy).

## Geo / pincode resolution — REUSE RG ERP
- User/admin enters a **pincode** → resolve **city, district, state**.
- **Reuse RG ERP's proven resolver** (`apps/backend/src/utility/pin.ts`): server-side proxy to India Post `api.postalpincode.in` (works around no-CORS + expired-TLS), picks Head Post Office District.
- **Read-through cache (added 2026-07-06):** `PincodeService` (`utility/pincode.service.ts`) checks in-memory → `pincodes` collection → India Post, then persists. India Post is hit **only for a pin we've never seen** (it was slow/flaky — first-time Gondia visitors waited up to ~1 min). The mapping is immutable so cached positives are permanent; misses get a 10-min in-memory TTL. Gondia's main pins are **pre-warmed at boot** (`SEED_PINS`, non-blocking) so even the first visitor is instant. Both the `pin-lookup` endpoint and listing create/edit go through it.
- Extension vs RG: RG returns `{city,state}` (city≈district). We surface **district + state + locality options** so the lister/admin confirms the exact city/area. Gondia `441601` → District: Gondia, State: Maharashtra.
- Approved cities/pincodes cached in `cities` (no offline dataset needed).

## Constraints
- Shared cluster, separate DB — never touch `RetailGridDB`.
- The `whatslocal2_0` database materializes on first write (standard Mongo behavior).
