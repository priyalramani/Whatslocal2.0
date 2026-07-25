# Architecture

The stack mirrors **RG ERP** exactly, so backend + frontend can share a single EC2 and reuse familiar tooling.

## Stack
- **Monorepo:** pnpm workspaces + Turbo (`apps/backend`, `apps/web`, shared `packages/*`).
- **Backend:** NestJS 10 + Mongoose 8, JWT/passport auth, dotenv.
- **Frontend:** React 18 + Vite 5 + React Router 6 + Tailwind 3, TypeScript.
- **Language:** TypeScript throughout.

## Layout (scaffolded 2026-06-21)
```
whatslocal2.0/
├── brand.config.json     → central project name (single source of truth)
├── package.json          → pnpm + turbo workspace root
├── apps/
│   ├── backend/          → NestJS API (port 9100)
│   │   └── src/
│   │       ├── main.ts, app.module.ts   → boot + Mongo connection (whatslocal2_0)
│   │       ├── brand.ts, health.controller.ts  → /health, /config
│   │       ├── utility/  → /utility/pin-lookup/:pin  (ported from RG ERP)
│   │       └── analytics/ → events schema + POST /events + GET /analytics/summary
│   └── web/              → React 18 + Vite 5 + Tailwind SPA (port 5180)
│       └── src/
│           ├── App.tsx   → city search bar + featured tiles (JOBS)
│           └── lib/      → brand.ts (@brand), analytics.ts (client tracker)
├── packages/
│   └── types/            → @whatslocal/types (Listing, Tag, AnalyticsEvent…)
├── scripts/              → one-off/util scripts (e.g. init-details.cjs)
└── docs/                 → this folder
```

## API surface (current)
| Route | Purpose |
|---|---|
| `GET /api/v1/health` | liveness + db state |
| `GET /api/v1/config` | public brand/name for the frontend |
| `GET /api/v1/utility/pin-lookup/:pin` | pincode → city/district/state/localities |
| `POST /api/v1/events` | analytics ingest (public) |
| `POST /api/v1/auth/login` | admin login → JWT (see [AUTH.md](AUTH.md)) |
| `GET /api/v1/auth/me` | current user (bearer) |
| `POST /api/v1/auth/otp/widget-verify` | real OTP login via MSG91 access-token (see [AUTH.md](AUTH.md)) |
| `POST /api/v1/auth/number/widget-verify` | verify a different contact number (MSG91) |
| `GET /api/v1/listings/search` | public browse/search (balanced or relevance ranked; see Ranking below) |
| `GET /api/v1/home/sections` | home page: admin-ordered sections, each balanced-ranked top 10 |
| `GET /api/v1/listings/by-slug/:slug` | listing by readable URL slug |
| `POST /api/v1/listings/upload` | upload ONE listing photo (JWT-gated) → `{key,view,thumb}` |
| `GET /api/v1/og` | Open Graph HTML for crawler bots (see OG pipeline below) |
| `GET /api/v1/og/img?id=` / `?path=` | dynamic share-card JPEG (listing / browse) |
| `POST /api/v1/events/identify` | link a visitor's anon history to a user on login |
| `GET /api/v1/analytics/summary` | analytics rollup — **admin-only** |
| `GET /api/v1/analytics/visitors[/:id]` | per-visitor list + deep detail — **admin-only** |

## Ranking (browse vs search)
Two distinct rank paths in `listings.service.ts`:

**Balanced default ranking** (`balancedScore`/`rankBalanced`) — used by the **browse path** of `search()` (no text query) AND every **home category row** (`homeSections()`). Formula per listing:

```
score = log10(1 + views)                                  # durable popularity
      + FRESH_BONUS(1.5) · 0.5^(ageDays / FRESH_HALFLIFE_DAYS(7))   # new-post boost
      + jitter                                            # tiny daily shuffle
```

- **Age is from `createdAt`** (the first post), so re-saving/editing a listing can **not** refresh its freshness boost — you can't game it by re-posting. The boost halves every 7 days (~gone within a month).
- **Jitter** is deterministic per `(listing, day)`: an FNV-1a hash of `id + YYYY-MM-DD` mapped into `[0, JITTER_MAX=0.1)`. It only reorders **near-ties**, and it rotates day to day so near-equal listings take turns near the top.
- **Why:** give brand-new listings real exposure to earn their first views without letting them bury genuinely popular ones; stale + ignored listings sink. (This replaced the old split where home was views-sorted and category/"See all" pages were `updatedAt`-sorted.)
- **Scale caveat:** candidates are ranked **in memory** from a pool capped at `RANK_POOL_CAP=500` (newest-first fetch). Fine at one-city scale; a category exceeding 500 rows would need a precomputed/stored score to rank correctly. Applies to both the home rows and the "See all" category/browse pages.

**Relevance ranking** (text search) is **unchanged**: coverage (how many query tokens matched) → cumulative field-placement score (title 10 / keywords 6 / short 4 / desc 2 / synonym-only 1, + exact/prefix title bonus) → views → recency. See [DECISIONS.md](DECISIONS.md).

## Social link preview (Open Graph) pipeline
When a WhatsLocal link is pasted into WhatsApp/Facebook/Telegram/etc., a rich card unfurls. The pipeline:

1. **nginx bot-routing.** nginx maps bot user-agents (`whatsapp`, `facebookexternalhit`, …) and routes them (on `location /`) to `GET /api/v1/og`, passing the original URL in the `X-Og-Path` header; humans get the SPA.
2. **`ogHtml(path)`** returns a tiny HTML page with `og:*` meta. It resolves the path:
   - listing slug (`/:city/:slug`) or legacy `/l/:id` → **listing card**;
   - a browse/category path (`/gondia`, `/gondia/job-opening`, `/gondia/cat/<key>`, `/gondia/sell`, …) → **browse card**;
   - anything else → the brand default card.
   Only **approved + active** listings render their own card (a pending/hidden post never leaks — falls back to the brand card).
3. **The image.** `og:image` points at `/og/<id>.jpg` (listing) or `/api/v1/og/img?path=…` (browse). Output is **JPEG, not PNG** — WhatsApp silently drops over-large preview images, and a 1200×630 photo is ~120 KB as JPEG vs ~750 KB as PNG (text cards ~83 KB). Dimensions are advertised as 1200×630, `image/jpeg`, `twitter:card=summary_large_image`.
4. **Listing card** (`buildCardSvg` in `og-card.ts`): a branded SVG (brand teal `#0b5650`, amber bottom bar) rasterised to JPEG (q92, mozjpeg). It adapts the eyebrow + highlight line per post type — sell **price**, rent **"₹X / period"**, job **salary range**, seeker **experience**, event **date**, news/info **label**, business **category** — with the **masked title** (respects hide-title), a category emoji (monochrome silhouette on the teal disc), and a **city + whatslocal.in** footer.
5. **Photo listings.** A listing WITH an uploaded cover photo renders that photo fit `contain` (no crop) on brand teal at 1200×630 (`buildPhotoOverlaySvg` composites a bottom gradient + city + whatslocal.in footer + amber bar; JPEG q84). Falls back to the generated card if the photo file is unreadable.
6. **Disk cache + nginx.** Real cards are written to a disk cache `/var/www/whatslocal-og/<id>.jpg` and served directly by an nginx regex `location`, with an `@oggen` Node fallback that renders on miss AND writes the file. In-memory caches back both (listing cards keyed by `id:updatedAt`; browse cards keyed by path with a 15-min TTL — see below).
7. **Pre-render + cleanup.** `warmOgCard(id)` renders the card to disk on **approve / create (admin) / edit / show**, then calls `prewarmSocial` (below). `removeOgCard(id)` deletes it on **hide / reject / owner-edit-to-pending**.
8. **Edit cache-busting.** WhatsApp caches a preview **per URL and per image format**, so an edited post must present a "new" URL/image. The app's Share button appends `?s=<ver>` to the share URL and the og:image carries `?v=<ver>`, where `ver` = base36 of `updatedAt`'s epoch ms. The SPA and OG renderer both ignore the query, so links still resolve cleanly; nginx ignores it and serves the latest file. **Known WhatsApp behavior:** the first scrape of a given URL must hit a ready image — hence the pre-render + pre-warm on approve/edit.

### Browse / category cards
`browseLabel(segs)` + `ogBrowseImage(path)`: sharing `/gondia`, `/gondia/job-opening`, `/gondia/cat/<key>`, `/gondia/sell`, `/gondia/other` etc. unfurls a branded card showing the section label + a **live count** (a lean indexed `countDocuments`, shown as e.g. "50+" once ≥ 10, plain number below 10) + a city footer. A **15-minute in-memory cache** (keyed by path) means the crawler never waits on the count + render.

### Social cache pre-warm
`prewarmSocial(id)` (env-gated by `FB_SCRAPE_TOKEN="APP_ID|APP_SECRET"`): after the card renders on approve/edit, it POSTs the listing's share URL(s) to Facebook's Graph scraper (`graph.facebook.com/?id=…&scrape=true`) — the same cache WhatsApp shares — so the **first** real share already has the full image, no flaky first scrape. It warms both the bare URL and the `?s=<ver>` variant. **No-op without the token.** See [DEPLOYMENT.md](DEPLOYMENT.md) for the env var and [DECISIONS.md](DECISIONS.md) for the rationale.

## Media pipeline (listing photos)
`POST /listings/upload` (JWT-gated) takes ONE image and re-encodes it with **sharp** into two compressed JPEGs: a **`view`** (fit inside ≤ 1280px, q82) for the detail page + the WhatsApp preview, and a **`thumb`** (≤ 480px, q75) for feed/search tiles. sharp `.rotate()`s (auto-orient) then drops metadata, so **EXIF — including GPS — is stripped** (photos never leak location; see [PRIVACY.md](PRIVACY.md)). It returns a `key` = `p` + 16 hex, stored in `listing.photos[]` (max 8). Files live at `/var/www/whatslocal-media/<key>/{view,thumb}.jpg`, served by nginx `^~ /media/`.

- **Display:** the detail page shows a gallery with `object-contain` (no crop); feed/search tiles show a uniform square media area (photo, or the category-icon placeholder when there is none).
- **Orphan cleanup:** photos dropped during an edit are deleted immediately; a periodic sweep (`sweepOrphanMedia`, 60s after boot + every 12h) removes any `/media/<key>` folder that no listing references **and** is older than a 24h grace window (covers photos uploaded for a post that was never submitted, plus any missed edit-time deletions). The key format (`^[a-z0-9]{6,40}$`) is guarded on every file op so a bad value can't escape `MEDIA_DIR` (path-traversal guard).

## Boot migrations (`onModuleInit` in `listings.service.ts`)
Idempotent, run on every start: (1) backfill a unique slug for any pre-slug listing; (2) re-mint a **random** slug for any `hide_title` listing whose slug still leaks the name; (3) rename legacy sell categories (`Cars (Used)`→`Cars`, `Bikes & Scooters (Used)`→`Bikes & Scooters`) and merge `Hardware / Paint / Building` + `Home Repair & Services` → `Home Repair Services` (de-dup the array, drop the merged-away `cat:hardware` from any saved home sequence); (4) schedule the orphan-media sweep.

## City landing / active-city logic
Frontend `lib/city.ts` + `App.tsx` + `ListingDetail.tsx`:
- **Bare `whatslocal.in`** → `Landing` reads `getLastCity()`: if the visitor has a remembered last city, redirect to `/{slug}`; otherwise render Home with the pincode popup forced. Dismissing the popup falls back to the default (Gondia), which is then remembered.
- **`wl_last_city`** (localStorage) holds the single most-recent city the visitor actively browsed; it's distinct from `wl_cities` (the SET of every city ever reached via the pincode switcher, used so `resolveCity(slug)` knows a dynamic city's name).
- **Opening a post switches the active city** to that post's city (`ListingDetail` calls `setLastCity`), so the in-page back button lands on that city's home and the next bare-URL visit goes there too. The back button (`goBack`) uses in-app history when present (`window.history.state.idx > 0` → `nav(-1)`), else lands on the post's city home instead of dropping the visitor out of the app (see [DECISIONS.md](DECISIONS.md), no-user-drop).

## Web routes
- `/` → user app (**mobile-only**, no login).
- `/{city}/{Title_Of_Listing}` → **readable listing permalink** (slug); `/{city}/{kind}` → category page (one dispatcher route decides). Legacy `/l/:id` still works.
- `/admin/login` → admin sign in.
- `/admin` → admin dashboard; `/admin/visitors[/:id]` → per-user analytics explorer (**responsive**, admin-only).

## Runtime
- **Dev:** backend on `:9100`, web on `:5180` (Vite proxies `/api` → backend).
- **Prod (LIVE since 2026-06-24):** single EC2 (`15.206.166.172`, co-tenant with RG ERP) hosts API (pm2 `wl-api` :9100) + built web bundle (nginx), live at **https://whatslocal.in** (Let's Encrypt SSL). See [DEPLOYMENT.md](DEPLOYMENT.md).

## Toolchain note
Node/pnpm are not installed system-wide. Use RG ERP's `.tools` on PATH:
`$env:PATH = "E:\DATA\DESKTOP\retailgrid\RetailGrid ERP\.tools;" + $env:PATH` (pnpm 9.12, node 22). Install with `$env:CI="true"; pnpm install --prefer-offline --config.confirm-modules-purge=false`.

## Toolchain note
Node/pnpm are not installed system-wide on the dev machine. Use RG ERP's `.tools/node.exe` and the mongodb driver under RG ERP's `node_modules/.pnpm/`.
