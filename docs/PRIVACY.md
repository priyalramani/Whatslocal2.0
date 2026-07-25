# Privacy & Number Gating

## Phone numbers are hidden and secured
- A listing's `mobile`/`alt_phone` is **never** included in public API payloads. The public shape ([`PublicListing`](../packages/types/src/index.ts)) omits phone and exposes only `has_phone: true`.
- To get a number the user "reveals" it via a dedicated action (separate endpoint, to be built) — this lets us **gate and meter** reveals and log each one.

## Gating rules (DESIGN NOW, ENFORCE LATER)
The owner will tune the exact thresholds; the architecture must support rules like:
- One user can fetch only **N numbers/day** (e.g. 5).
- After **time in app** (e.g. 10 min) or **X reveals** (e.g. 3), the 4th reveal **requires login**.
Implications already baked in:
- Every reveal is an analytics event (so we can count per visitor/day).
- Anonymous visitors have a `visitor_id`; reveals are meterable before login exists.
- Public listing never leaks the number, so gating can't be bypassed client-side.

## Fully-private contact (`hide_number`) — Happening news/info
Separate from reveal-gating: a listing can keep its number **fully private**. When `hide_number` is set (used by Happening **news/info** posts), the number is collected only for OTP/ownership and is **never** exposed:
- `toPublic` forces `has_phone`, `call_ok`, `whatsapp_ok` all **false** (so the UI shows no "Show number" button and no Call/WhatsApp).
- `reveal()` refuses even if asked (404 "Contact not available").
- The posting form guards the flag to **Happening-only**, so it can't leak onto a business listing. (This was a real bug — see [DECISIONS.md](DECISIONS.md) 2026-06-26 + [SECURITY.md](SECURITY.md).)

## Uploaded photos — EXIF/GPS stripped
Listing photos are re-encoded server-side with **sharp**, which auto-orients then **drops all metadata** — so **EXIF, including GPS coordinates, is stripped**. A photographer's phone-camera location can never leak through an uploaded listing photo. Only the two compressed derivatives (`view`/`thumb`) are stored; the original is discarded. See [ARCHITECTURE.md](ARCHITECTURE.md) media pipeline.

## Title masking (hide-title option)
When a lister (esp. a job-seeker candidate) chooses **hide title**:
- Public sees each word's **first letter + exactly `***`** (3 asterisks, regardless of word length).
- `maskTitle("Rajesh Kumar", true)` → `"R*** K***"`; `maskTitle("Rajesh", true)` → `"R***"`.
- Implemented once in shared types ([`maskTitle`](../packages/types/src/index.ts)) so backend and web mask identically. Backend applies it when building `PublicListing`; the real title is never sent when hidden.

## Status
Helpers + types exist now. Enforcement endpoints (reveal + metering + login-trigger) come with the listings API.
