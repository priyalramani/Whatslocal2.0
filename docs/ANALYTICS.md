# Analytics

Analytics is **first-class from day one** — the owner plans to ship ~10 updates/day for a month, so the product must tell us what to fix/add next. Everything is captured in one `events` collection on `whatslocal2_0`.

## Why this matters most: zero-result searches
The single highest-value signal. Every time someone searches for something the city doesn't have yet (`search_zero_results`), it's a direct to-do list of listings/keywords to add. Surfaced explicitly in the summary endpoint.

## What we capture
Browser → `POST /api/v1/events` (fire-and-forget via `navigator.sendBeacon`). Server stamps `ts`, parses `device` from the User-Agent, captures `ip`.

| Field | Meaning |
|---|---|
| `type` | page_view, search, search_zero_results, listing_view, contact_click, featured_click, post_start, post_submit |
| `visitor_id` | persistent anon id (localStorage) → unique users |
| `session_id` | per-session id (sessionStorage) → sessions/visits |
| `user_id` | set once accounts exist |
| `path`, `referrer` | where they are / came from |
| `city`, `pincode` | location context |
| `query`, `result_count` | what they searched + how many hits |
| `listing_id`, `target` | which listing / which action (call, whatsapp, share, jobs) |
| `duration_ms` | time on page (when measured) |
| `lang` | UI language at the time (`en`/`hi`) — read from localStorage on every event |
| `user_id` | **auto-attached** once logged in (read from the stored session); on login `/events/identify` backfills the visitor's earlier anonymous events |
| `device` | `{ type: mobile/tablet/desktop, os, brand, browser }` (parsed server-side) — `brand` is a best-effort handset make (Apple / Samsung / Xiaomi / Realme / Vivo / Oppo / OnePlus / Pixel / Nothing / iQOO / Motorola / Infinix / Tecno / Nokia / generic Android). The **exact iPhone/Android model is NOT in the UA**, so Apple = "Apple", not the model. |

A **`RouteTracker`** fires a `page_view` on every in-app navigation (the click trail), so per-page dwell is derivable from event timestamps.

## Endpoints
- `POST /api/v1/events` — ingest (202). Browser client: [`apps/web/src/lib/analytics.ts`](../apps/web/src/lib/analytics.ts).
- `POST /api/v1/events/identify { visitor_id }` — **JWT-guarded**. On login, stamps the visitor's prior anonymous events with the caller's `user_id` (identity from the token, never the body — a visitor can only ever be linked to the caller's own identity).
- `GET /api/v1/analytics/summary?from=ISO&to=ISO` — defaults to last 30 days. Returns:
  - `unique_visitors`, `sessions`, `total_events`
  - `by_type`, `device_breakdown`
  - `top_searches`, **`zero_result_searches`**
  - `by_day` (events + unique visitors per day)
- `GET /api/v1/analytics/visitors?page=&identified=` — **AdminGuard**. One row per person (newest activity first): identity (mobile when known), events/views/contacts/searches/sessions counts, langs, city, device, **`brand`** (handset make) and **`income`** (estimated affluence tier — see below).
- `GET /api/v1/analytics/registered-users` — **AdminGuard**. Drill-in from the dashboard "Registered users" card. One row per OTP-registered user (**newest registration first**) with an at-a-glance profile: **came from** (first-event referrer host, else "direct / link"), **contacts requested** (distinct listings whose contact they pulled), **registered_at** (user `createdAt`) + **first_seen** (first event), **time_spent** (per-session span sum), **language** (most-used), **interest** (top bucket via the same points model as visitor-detail), and **income** tier+score. Row → the full activity tracker (`visitorDetail` by `user_id`). (Only ~9 users, so computed per-user in one events pass.)
- `GET /api/v1/analytics/posts` — **AdminGuard**. Drill-in from the "Number of posts" card. Per **live** post: **landings** (distinct sessions whose FIRST event resolves to this post — i.e. arrived via its shared link, matched by `listing_id` or path→`/l/:id`/slug), **visitors** (distinct people who opened it), **views** (total opens), **contacts** (distinct people who actually **contacted** — see below) + **contact_actions**. Sorted by reach (visitors). Row → the listing.

### "Contacted" definition (decided 2026-07-05)
A `contact_click` fires with a `target`: `open` (tapped **Show number** — the reveal, gated at 3 free then register), then `call`/`whatsapp`/`copy` (only after revealing), plus `share` (shared the post) and `cta`/`cta2` (custom buttons). The admin **"Contacted"** metric (post-analytics `contacts`, registered-users `contacts`) counts **distinct people whose `target ∈ {call, whatsapp, copy}`** — i.e. they *acted* on the number, not merely revealed it or shared. `CONTACTED_TARGETS` in `analytics.service.ts`. (Reveals/shares/CTA are still logged and visible in the Leads feed + visitor timeline; they just don't inflate "Contacted." Example: a post revealed 87× but only 65 people actually called/messaged.)
- `GET /api/v1/analytics/leads?page=` — **AdminGuard**. **Contact-interest LEADS feed** (monetization): every `contact_click` (reveal/call/whatsapp/copy/share/cta) resolved to **who** (viewer — mobile when logged in, else anonymous, each linking to their visitor detail) showed interest in **which post** (masked title, links to the listing) and **what** action, newest first. This is the billable interest signal — the raw record was always captured; this view makes it actionable. Admin page: **`/admin/leads`**.
- `GET /api/v1/analytics/visitors/:visitorId` — **AdminGuard**. Deep per-visitor detail: identity, first/last seen, time-engaged (per-session span sum), languages, devices, **interest ("top categories") as a points model** (see below), **contact/share actions** (with listing titles), searches (incl. zero-result), and the full event **timeline**. Also: the **entry/landing page** + **external referrer**, the **latest language**, and the **current (most-recent) city**. (`AnalyticsModule` imports `AuthModule` + the `Listing` model to resolve mobiles & titles.)

### Visitor detail — what's computed
- **Entry / landing page:** the visitor's **first event's path** (external `referrer` alongside). If that path resolves to a listing (slug or `/l/:id`), it's resolved to the post's masked title + slug so the admin can click through to exactly where they landed.
- **Interest = a POINTS model** (not raw view counts): every signal scores, bucketed by **category** (business) or **kind/post_type** fallback (Jobs / Happenings / Sell-Rent / Other) so non-category posts count too. Points: a `listing_view` = `3 + min(dwell-minutes,5)×6` (time-weighted, dwell = gap to the next same-session event, min 15s / cap 300s); a `contact_click` = call/whatsapp 30, cta/directions 20, share 15, copy 12, open 8; **what the user posts** = their own listings ×40 (the strongest signal). Ranked by points.
- **Latest language + current city:** `last_lang` = the most recent event's `lang`; `current_city` = the most recent event's `city` (both walk backwards from the newest event). Shown as "the language they now use" and "📍 {city} · now", distinct from the full sets.
- Grouping is **per person, not per device:** identified users are keyed by `user_id` (all their devices merge); anonymous stay per `visitor_id`. The list's drill-in id is that group key; the detail query is `{$or:[{user_id:id},{visitor_id:id}]}`.

## Income / affluence tiering (for targeting)
Every visitor — **anonymous included** — is scored into a rough **High / Mid / Low** income tier so the owner can target later (e.g. premium offers to iPhone/English users, mass offers to the rest). Cheap signals only, nothing the user types; it's an estimate, not a fact.

- **Function:** `incomeSignal({ os, brand, lang, topLabel })` in [`analytics.service.ts`](../apps/backend/src/analytics/analytics.service.ts) → `{ score 0–100, tier }`. Base 35, then:
  - **Handset (the strongest cheap signal in India):** Apple/iOS **+40**; Pixel/OnePlus/Nothing/iQOO **+18**; Samsung **+10**; generic Android **+3**; unknown/desktop **+15**.
  - **Language:** UI in English **+18** (English fluency correlates with income here; Hindi is the default and neutral).
  - **Interest:** top category matches a high-value intent (property/flat/car/gold/electronics/laptop…) **+8**; matches a low-value intent (job/labour/maid/kirana/daily…) **−8**.
  - Clamped 0–100. **Tier:** `≥65 High · ≥38 Mid · else Low`.
- **Where it shows:** an **Income** pill column in the Visitors list (per row: brand + tier), and a 💰 tier+score pill plus a 📱 brand pill in the visitor-detail header. The detail's `income` = `{ tier, score, brand, os }` and folds in the interest signal (list rows don't, to stay cheap).
- **Anonymous → login merge:** because the score rides on `visitor_id`, an anon visitor already carries a tier; when they log in, `/events/identify` stamps their prior events with `user_id`, so their accumulated affluence signal + interest history follow them into their identified profile — no data lost.

## Public "visitors today" counter (inflated)
`GET /api/v1/stats/visitors-today?city=` returns distinct `session_id`s since local midnight (= visits, not unique people; optionally city-filtered), then **inflates it server-side for social proof**: `shown = floor(INFLATE_BASE + real × INFLATE_MULTIPLIER)`. The **real count never leaves the server** — only the inflated number is returned. Values are env-tunable in the box `.env` (currently **BASE = 613, MULT = 7.63**). Admin analytics always shows the REAL numbers.

## Admin UI
- **Dashboard** (`/admin`) — the summary. Top row is 3 metrics: **Unique visitors** (→ explorer), **Registered users** (→ registered list), **Number of posts** = live posts, approved+active (→ post analytics). All three cards click through.
- **Registered users** (`/admin/registered`) — the per-user profile list above; row → visitor detail.
- **Post analytics** (`/admin/posts`) — per-post reach (landings / visitors / views / contact requests); row → the listing.
- **Visitors** (`/admin/visitors` → `/admin/visitors/:id`) — the per-user list + deep detail above. This is how the owner "knows the users": who they are once they log in, what they browse, and what they tap.
- **Leads** (`/admin/leads`) — the contact-interest feed (above): who acted on which post's contact and how. The reverse of visitor-detail's "Contact actions" (post-centric demand, not person-centric), for future billing.

## Roadmap
- Admin analytics dashboard (visualize the summary).
- Per-listing view/contact counts (so listers see their stats).
- Retention (returning visitors), funnels (search → view → contact → post).
- Move high-volume ingest to batching if traffic grows.

## Privacy note
`ip` is stored for rough geo/abuse detection only. Revisit before scaling (hash or drop if not needed). No third-party trackers — first-party only.
