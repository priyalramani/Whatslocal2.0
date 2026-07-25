# Security & Data Privacy

**Hard constraint (owner, 2026-06-21):** data must not leak. No one should be able to run a script against our API and extract user data (phones, listings in bulk, personal fields). Security is a first-class requirement on every feature — not a later pass.

## Threat we are designing against
A motivated actor hitting our public API (or a bot) trying to **scrape the whole directory** — especially phone numbers and personal data — by automating requests.

## Current posture (honest, as of 2026-06-21)
What's already safe:
- **No sensitive data endpoint exists yet.** The only data route is `/analytics/summary`, which is **admin-only (JWT + role guard)**, verified (no-token → 401, non-admin → 403).
- **DB credentials are server-side only** (backend `.env`, gitignored). The browser never sees them.
- **Passwords** are bcrypt-hashed, never stored or returned in plaintext.
- **Phone privacy is designed in:** the planned public shape (`PublicListing`) omits `mobile`/`alt_phone` entirely.

Done (2026-06-22):
- **CORS allowlist** (`CORS_ORIGINS` env), **helmet** security headers, **global rate limit** (120/min/IP) + tighter per-route caps (reveal 15, submit 6, search 40).
- **Phone never leaves the server** in list/detail responses — verified (`mobileLeaked=false`).
- **Phone reveal is gated/metered/logged** — anon free up to the admin-set **contact limit** (default 3) DISTINCT lifetime then login required, hard cap 5/day; counted in `reveals`. The contact limit + a **time-spent limit** (default 30 min) are tunable in **admin Settings** (`app_config.login_gate`) — either limit reached forces a free register. Contact limit enforced server-side in `reveal()`; time limit enforced client-side (`LoginGate`). `0` disables a limit.
- **All inputs validated** via typed DTOs (`forbidNonWhitelisted`) → over-posting + injection defense.
- **No bulk dump** — search is approved-only, projected, paginated (≤20).

Still open (before prod / before real public data):
- **JWT secret** in `.env` is a dev value — rotate to a strong per-env secret. (owner)
- **Least-privilege Mongo user** scoped to `whatslocal2_0` only — see below. (owner)
- HTTPS + final CORS domains at deploy time.

## The leak-prevention rules (apply to EVERY data endpoint we build)
1. **Server-side projection, always.** The server decides which fields go out. Phone/personal fields are stripped on the server, never sent and filtered client-side. Phones leave the server only through a gated **reveal** action (metered, logged — see [PRIVACY.md](PRIVACY.md)).
2. **No bulk dump.** Every list endpoint is **paginated with a hard max page size** (e.g. ≤ 50) and sensible defaults. No endpoint returns "all listings".
3. **Rate limiting + abuse throttling** on every public endpoint (per IP + per `visitor_id`), tighter on search and reveal. Detect and slow scrapers.
4. **Reveal gating** (the anti-scrape core): N reveals/day per visitor, login required after threshold, each reveal logged. A scraper can't harvest numbers because numbers require gated, metered, authenticated-after-threshold reveals.
5. **Validated, typed inputs only** (NestJS `ValidationPipe` + DTOs, already global). Never pass raw user objects into Mongo queries → prevents **NoSQL injection** (`$where`, operator injection). Cast/whitelist query params.
6. **AuthZ on every mutation**, ownership checks (a user can only edit their own listing; only admin approves).
7. **Least-privilege DB user** (see below).
8. **No secrets/PII in logs**, no stack traces to clients, generic error messages.
9. **HTTPS only** in prod; secure headers (helmet); httpOnly cookies if we move tokens off localStorage.
10. **CORS allowlist** to our domain(s) only.

## DB user isolation (recommended NOW)
`whatslocal2_0` should use a **dedicated Atlas DB user scoped to the `whatslocal2_0` database only** (`readWrite` on `whatslocal2_0`, nothing on `RetailGridDB` or `admin`). Today it reuses RG ERP's broader user, so a whatslocal compromise could reach RG ERP's production data. Creating a scoped user in Atlas removes that blast radius. Owner action: add the user in Atlas → put its URI in `apps/backend/.env`.

## Lesson (2026-06-22): exclude-by-default
Testing caught the public listing payload leaking `posted_by_mobile` and `whatsapp` (both phone numbers). Fixed: the public projection (`toPublic` + the Mongo projection) now strips mobile, alt_phone, **whatsapp**, search_blob, and **all audit fields** (posted_by_*, approved_by/at, source). **Rule:** when adding ANY field to the `listings` schema, decide explicitly if it's public; sensitive/internal fields must be added to the exclusion list. Default = not public.

## Photo upload hardening (2026-06-26)
- **Auth-gated:** `POST /listings/upload` is `JwtAuthGuard`-protected and rate-limited (30/min). No anonymous uploads.
- **Re-encoded, never served raw:** sharp re-encodes to fixed-size JPEG derivatives, so an uploaded file is never executed or served as-is (no SVG/HTML/polyglot payload survives). **EXIF/GPS is stripped** (see [PRIVACY.md](PRIVACY.md)).
- **Path-traversal guard:** photo keys must match `^[a-z0-9]{6,40}$` (validated in the DTO AND re-checked before any `MEDIA_DIR`/`OG_DIR` file op — delete, sweep, render), so a crafted key can never escape the media directory.
- **Orphan sweep** reclaims abandoned uploads (boot + every 12h, 24h grace) — an attacker can't fill the disk with uploads that are never attached to a post.

## `hide_number` — defence in the projection (2026-06-26)
A fully-private number never leaves the server: `toPublic` forces `has_phone`/`call_ok`/`whatsapp_ok` false when `hide_number` is set, and `reveal()` refuses. Same exclude-by-default principle as the phone/audit fields. See [PRIVACY.md](PRIVACY.md) + [DECISIONS.md](DECISIONS.md).

## Standing rule
Before merging any feature that reads/writes user data, check it against rules 1–10 above. If a new endpoint could return more than one user's data, it must be paginated, projected, rate-limited, and (for sensitive fields) gated.
