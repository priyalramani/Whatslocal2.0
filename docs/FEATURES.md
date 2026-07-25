# Features

Inventory of every feature and its status. Statuses: PLANNED / IN-PROGRESS / ACTIVE / DEPRECATED.

| Feature | Status | Notes |
|---|---|---|
| Database bootstrap (`whatslocal2_0` + `details`) | ACTIVE | Created 2026-06-21 |
| Monorepo scaffold (backend + web + types) | ACTIVE | Builds + runs; backend :9100, web :5180 |
| Health/config endpoints (central brand) | ACTIVE | `/health`, `/config` read `brand.config.json` |
| Pincode resolver (Gondia verified) | ACTIVE | `/utility/pin-lookup/:pin`, ported from RG ERP |
| Analytics pipeline (events + summary) | ACTIVE | Visitors/sessions/devices/searches + zero-result; now also `lang`+`user_id`+per-nav page_view; see ANALYTICS.md |
| Per-user analytics + identity linking | ACTIVE | `POST /events/identify` links anon history to a user on login; admin **Visitors** explorer (`/analytics/visitors[/:id]`) |
| City search bar + featured tiles (web) | ACTIVE | Skeleton UI; search logs events (real search next) |
| User app = mobile-only shell | ACTIVE | Phone-width column on desktop; no login required |
| Admin auth (JWT login, bcrypt) | ACTIVE | `users` collection; `/auth/login`; admin seeded |
| Admin dashboard (responsive) | ACTIVE | `/admin`; shows analytics incl. zero-result searches |
| Premium/clean Home UI (Google-like) | ACTIVE | Single pill search + quiet shortcuts |
| Desktop `.bat` launcher | ACTIVE | `whatslocal-start-localhost.bat` on Desktop |
| Security hardening | ACTIVE | helmet, CORS allowlist, rate limiting, validated DTOs |
| Tags/keywords (controlled, request+approve) | ACTIVE | 57 seeded; type-ahead + co-occurrence suggest |
| Listing submission → pending | ACTIVE | Requires OTP login; post_type dropdown (7 templates); audit metadata |
| OTP login (general users) | ACTIVE | **Real SMS via MSG91** headless widget; server verifies access-token (`/auth/otp/widget-verify`); demo `1234` fallback when env unset. See AUTH.md |
| OTP anti-bot captcha (hCaptcha) | ACTIVE | Rendered inline in our login box (`renderCaptcha`/`isCaptchaVerified`); toggle in MSG91 Widget Settings |
| Readable listing URLs (slugs) | ACTIVE | `/{city}/{Title_Of_Listing}`; unique + stable; `GET /listings/by-slug/:slug`; legacy `/l/:id` kept |
| Auto-suggested keywords (business) | ACTIVE | Picking a sub-category pre-fills ~6 common search keywords (editable); `SUGGESTED_KEYWORDS` in types |
| Rich WhatsApp share | ACTIVE | Share button composes icon+title+meta+link message; share URL carries `?s=<ver>` so edited posts re-preview |
| WhatsApp/social link unfurl (OG) | ACTIVE | nginx bot-routing → `GET /api/v1/og`; **auto-generated 1200×630 JPEG share card per listing** (adapts eyebrow/highlight per post type — price/rent/salary/exp/event/category — masked title + city footer), served from `/var/www/whatslocal-og` disk cache. See ARCHITECTURE.md |
| Listing cover photo on share card | ACTIVE | A listing WITH an uploaded photo unfurls the cover photo (fit `contain` on brand teal) + city footer instead of the generated card |
| Browse/category OG cards | ACTIVE | Sharing `/gondia`, `/gondia/job-opening`, `/gondia/cat/<key>`, `/gondia/sell`… unfurls a branded card with the section label + **live count** ("50+" once ≥10) + city footer; 15-min in-memory cache |
| Social cache pre-warm | ACTIVE | On approve/edit, pings Facebook's scraper (shared w/ WhatsApp) so the first share already has the full image; env-gated by `FB_SCRAPE_TOKEN`, no-op without it |
| Listing photo upload | ACTIVE | `POST /listings/upload` (JWT); sharp → `view`(≤1280,q82)+`thumb`(≤480,q75), **EXIF/GPS stripped**; ≤8 photos; nginx `/media/`; orphan sweep |
| Balanced default ranking | ACTIVE | Browse + home rows ranked by `log10(1+views)` + fading fresh-boost (from `createdAt`) + daily jitter; text search still relevance-ranked. See ARCHITECTURE.md |
| Sell/Rent = mode-driven form | ACTIVE | First choose Sell vs Rent (`sale_or_rent`); categories filtered by mode (`sellCategoriesForMode`); Property merged; Cars/Bikes rentable; rent adds free-text `rent_period` |
| `hide_number` privacy (Happening news/info) | ACTIVE | Number collected for OTP/ownership but never exposed; `toPublic` forces has_phone/call_ok/whatsapp_ok off + `reveal()` refuses; form-guarded to Happening-only |
| Sell/Rent + Other home sections | ACTIVE | `ptype:` sections so every post type lists; `post_type` search filter + browse |
| No-user-drop smart Back | ACTIVE | Direct-landing visitors → category "See all" instead of exiting the app |
| Production deploy (whatslocal.in) | ACTIVE | Live 2026-06-24 on RG ERP EC2; domain + Let's Encrypt SSL; see DEPLOYMENT.md |
| Public search (projected, paginated) | ACTIVE | Approved-only, phone stripped server-side, weighted text index |
| Single "Search keywords" field (max 25) | ACTIVE | Dictionary tags + free keywords in one box; brands searchable (Paperboat→found) |
| Happening type (Events/News/Information) | ACTIVE | `post_type=happening`, own kind; admin-approved (= news moderation) |
| Report a listing + admin review | ACTIVE | Reason + details → `reports` → `/admin/reports` |
| Keyword edit (admin) | ACTIVE | PATCH name/synonyms; inline edit on Keywords page |
| Gated phone reveal (metered) | ACTIVE | Anon 3/day → login; hard cap 5/day; `reveals` log |
| Hide-title masking | ACTIVE | `Rajesh Kumar`→`R*** K***`, server-side |
| Admin approval queue | ACTIVE | `/admin/approvals` approve/reject |
| Admin keyword management | ACTIVE | `/admin/tags` approve requests / add / remove |
| Posting fields (seeker/opening) | ACTIVE | dob/gender/exp, salary/timing/off-days/lang captured |
| Listing submission (business / service / job) | PLANNED | One form, tag-referenced (many tags) |
| Admin approval workflow | PLANNED | Listings + user-requested tags approved by owner before going live |
| Pincode → city/district/state resolution | PLANNED | Reuse RG ERP's India Post proxy; approved cities cached in `cities` |
| Tag system (100s, controlled, many-to-many) | PLANNED | `tags` collection; type-ahead multi-select; new tags need admin approval |
| Business / services directory (yellow pages) | PLANNED | Public browse + search |
| Featured shortcut tiles on city home | PLANNED | Curated, short list above/around search bar; admin-defined |
| Jobs directory (seekers + employers) | PLANNED | Featured JOBS tile → Post Resume / Post Job Opening; browse + search |
| City rollout (Gondia first: 441601/441614) | PLANNED | Expand city by city |
