# Decisions

A dated log of key decisions and their rationale. Newest at the top.

## 2026-07-05 — Ward Complaints civic board — design decisions (not built)
A new ward-scoped civic complaint board (residents post problems → ward members + public comment → poster marks resolved). Decisions locked: **(1)** posting needs login **+ a name**, and complaints/comments show the **name, not the mobile** (the one surface where we collect + display a name; listings stay mobile-only); **(2)** ward-member mobile shown **openly**; **(3)** **every complaint AND comment pre-approved** by admin + a "be respectful" acknowledgment on the forms; **(4)** ward members get **verified accounts + an Official badge** (recommended tweak: auto-approve member/admin comments so official replies don't wait). Separate module (`wards` / `complaints` / `complaint_comments`) — not shoehorned into listings, because the lifecycle (comments + resolution + ward) is too different. Rationale + full spec: [COMPLAINTS.md](COMPLAINTS.md). Highest-moderation-risk surface → accountability (non-anon, named, pre-approved) is deliberate. Consequences accepted: public real names expose complainants; open member numbers are scrapable; pre-approving comments is real-time admin load.

## 2026-07-05 — Kind-aware ranking: popularity only for evergreen listings (SHIPPED)
Popularity (lifetime views) is only right for **evergreen** listings; it's wrong for **transactional** ones that get consumed and go stale (a hired seeker, a filled opening, a sold item, yesterday's news) — a popular-but-done post buries fresh ones, and views ≠ relevance for the employer/buyer. So `rankScore` (in `listings.service.ts`, replacing `balancedScore`) is now **per-kind**:
- **Transactional → freshness + jitter, NO popularity**: `job_seeker`, `job_opening`, `post_type=sell`, `happening` **news**. Verified live: top job seekers are now the newest (0–2 views), while the old high-view profiles (that used to top the feed) sank.
- **Events (`happening`/event) → date-anchored**: upcoming events headline the happening feed **soonest-first** (`EVENT_BASE + 1/(1+daysUntil)`); **past events are filtered out** entirely. `event_date` is FREE TEXT, so parsing is **best-effort + conservative** (`parseEventDate`): only ISO `yyyy-mm-dd` or "written-month + 4-digit year" count; ambiguous slash dates (12/08 = Dec or Aug?) are never hidden/reordered — they fall back to freshness. ⇒ hide-past only fires on confidently-parsed dates. **Follow-up:** make event date a real date-picker to make this reliable.
- **Evergreen → unchanged** (popularity + freshness + jitter): `business`, `happening` **info**, `other`.
- The `total` counts in home sections + browse are discounted by any dropped past events so they don't overstate what's shown.
- **Deferred to phase 2:** the availability/expiry lever ("still looking?" / "mark sold" / "still hiring?") — the generic version of what popularity fails to capture. Also: mild profile-completeness boost for seekers; a possibly slower freshness half-life for freshness-primary kinds (currently the shared 7-day).

## 2026-06-26 — Share cards (OG image), balanced ranking, photos, hide_number
- **Balanced default ranking (browse + home).** Both the home category rows and the "See all" category/browse pages now rank by `score = log10(1+views) + FRESH_BONUS(1.5)·0.5^(ageDays/7) + jitter` (`balancedScore`/`rankBalanced`). Rationale: give a brand-new listing real exposure to earn its first views **without** letting it bury a proven-popular one; the boost **fades** (halves weekly, gone in ~a month) and is measured from **`createdAt`** so re-posting/editing can't game it. A per-`(listing, day)` FNV-1a jitter (`[0,0.1)`) rotates near-ties daily. Text **search** keeps relevance ranking (coverage → field score → views → recency). Candidates ranked in memory from a 500-cap pool — fine at one-city scale; > 500 in a category would need a stored score.
- **Auto-generated WhatsApp share card, output as JPEG (not PNG).** Every approved listing gets a server-rendered 1200×630 card built from its own data (`buildCardSvg`), zero upload friction — the eyebrow + highlight adapt per post type (sell price, rent "₹X / period", job salary range, seeker experience, event date, news/info label, business category), title masked per hide-title, brand teal + amber. **JPEG, not PNG:** WhatsApp silently drops over-large preview images, and a 1200×630 image is ~120 KB JPEG vs ~750 KB PNG (text cards ~83 KB). A listing WITH an uploaded photo unfurls the cover photo (fit `contain`, no crop) branded with the city + whatslocal.in footer instead. Cards live in a disk cache nginx serves directly; pre-rendered on approve/create/edit/show, removed on hide/reject. Edited posts re-preview via a base36-`updatedAt` cache-buster (`?s=`/`?v=`) because WhatsApp caches per URL/format.
- **Browse/category cards + social pre-warm.** Sharing a section/category path unfurls a branded card with the section label + a **live count** ("50+" once ≥ 10) + city (15-min cache so the crawler never waits). **`prewarmSocial`** (env-gated by `FB_SCRAPE_TOKEN="APP_ID|APP_SECRET"`) pings Facebook's scraper — the cache WhatsApp shares — on approve/edit so the very first share already has the full image; a no-op without the token (keeps local/dev clean and makes prod pre-warming opt-in per env).
- **Listing photos, EXIF stripped.** `POST /listings/upload` (JWT) re-encodes ONE image with sharp into `view`(≤1280,q82)+`thumb`(≤480,q75); **EXIF incl. GPS is stripped** so photos never leak location. Key = `p`+16 hex in `photos[]` (≤8); files under `/var/www/whatslocal-media`, served by nginx `/media/`; key-format path-traversal guard on every file op; orphan sweep (boot + every 12h, 24h grace) reclaims abandoned uploads.
- **`hide_number` — a fully-private contact for Happening news/info.** News/info posts still collect a number (for OTP + ownership) but must never expose it. `toPublic` forces `has_phone`/`call_ok`/`whatsapp_ok` false and `reveal()` refuses when `hide_number` is set. The posting form guards the flag to **Happening-only** (`hideNum = postType==='happening' && hide_number`) so switching post types can't carry the flag onto a business listing — a real bug that had hidden Bharat Traders' contact; fixed in both data and code.

## 2026-06-24 — LIVE on whatslocal.in: domain+SSL, real OTP, readable URLs, deep analytics
Big day — WhatsLocal went to **production** (https://whatslocal.in) and gained real phone-OTP login. See [HISTORY.md](HISTORY.md), [AUTH.md](AUTH.md), [ANALYTICS.md](ANALYTICS.md), [DEPLOYMENT.md](DEPLOYMENT.md).

- **Production deploy** — co-tenant on RG ERP's EC2 (`15.206.166.172`): own dir `/home/ubuntu/whatslocal`, pm2 `wl-api` :9100, nginx vhost, `/var/www/whatslocal2/dist`. **Domain `whatslocal.in`** (GoDaddy A/CNAME) + Let's Encrypt SSL + http→https. `trust proxy = 1` in `main.ts` so `req.ip` is the real client IP behind nginx (else the throttler buckets everyone as `127.0.0.1`). Build-locally-ship-dist; backend `.env` on the box is never overwritten (secrets edited in place). RG ERP untouched.

- **Readable listing permalinks (slugs).** Public URL is now **`/{city}/{Title_Of_Listing}`** (e.g. `/gondia/Sharma_General_Store`) — local feel + shareable + readable. Each listing has a unique `slug` (ASCII, words joined by `_`, case kept, accents folded), **stable once minted** (kept on title edits so shared links never rot), unique via `_2`/`_3` suffix + partial-unique index + create-retry. One route `/:city/:kind` dispatches: a known kind slug → category page, else → listing detail (`getPublicBySlug`, `GET /listings/by-slug/:slug`). Legacy `/l/:id` still resolves; idempotent slug backfill on boot. `slugifyTitle`/`suggestedKeywordsFor` etc. in `@whatslocal/types`.

- **Real phone OTP via MSG91 (headless widget).** Replaced the demo `1234` with MSG91's "Login with OTP" widget driven **headlessly** (our own `OtpLogin` UI). `lib/msg91.ts` loads `verify.msg91.com/otp-provider.js`, `initSendOTP({widgetId, tokenAuth, exposeMethods:true, captchaRenderId})`, calls `sendOtp`/`verifyOtp`; the returned access-token JWT → backend `POST /auth/otp/widget-verify` (+ `/auth/number/widget-verify`) which confirms it via MSG91 `verifyAccessToken` (`MSG91_AUTH_KEY`) and reads the **verified** number from the token — never trusts a client-supplied number. Env-gated (`VITE_MSG91_WIDGET_ID`+`VITE_MSG91_TOKEN_AUTH` public; `MSG91_AUTH_KEY` secret) → falls back to demo `1234` when unset. **No DLT needed for SMS:** widget → Channels Config → SMS → **"Use Default Configuration"** (MSG91 shared template; generic sender, no per-OTP logs). Gotchas learned: methods appear a beat after init (poll for them); headless renders no captcha so it must be OFF unless rendered inline; MSG91 returns HTTP 200 even on errors (`type:"error"`); Demo-Credentials override + account KYC blocked early delivery (not DLT). Authkey IP-Security ON, whitelisting the box IP `15.206.166.172`.

- **Inline captcha (anti-OTP-bombing).** `renderCaptcha()` renders hCaptcha into `#msg91-captcha-box`; `OtpLogin` and the Post submit step gate "Send OTP" on `isCaptchaVerified()`. SPA-safe: re-renders each popup mount, and `sendOtp` never re-inits (so it can't wipe a solved captcha); when captcha is disabled the box stays empty and the flow proceeds. Owner enables it via Widget Settings.

- **Deep per-user analytics + admin Visitor explorer.** Every event now carries `lang` + `user_id`; a `RouteTracker` logs a `page_view` per navigation (path trail + timestamps for dwell); on login `POST /events/identify` backfills the visitor's prior anonymous events with their user_id (**identity-linking** — "we had all the behaviour, just the identity was missing"). New admin **Visitors** tab: `GET /analytics/visitors` (one row per visitor, newest first, identity attached) → `GET /analytics/visitors/:id` deep detail (time-engaged, languages, **categories browsed**, **contact/share actions**, searches incl. zero-result, full timeline). `AnalyticsModule` now imports `AuthModule` + the `Listing` model to resolve mobiles & titles.

- **Auto-suggested keywords.** Picking a business sub-category pre-fills ~6 curated, most-searched keywords for it (union across up to 3 categories, deduped, capped 25). Smart reconcile: removing a category pulls its words unless another selected category shares them; manual edits/removals preserved; edit-load seeded so it never re-pads an existing listing. Data: `SUGGESTED_KEYWORDS` in types. Rationale: show the lister what good keywords look like; the full synonym set already widens search server-side regardless.

- **No-user-drop (smart Back).** A first-time visitor landing cold on a shared link who taps the detail page's ← had no in-app history → `nav(-1)` dropped them out of the app. Now `goBack()` detects a direct landing (`window.history.state.idx === 0`) and routes them to the listing's category **"See all"** page instead of exiting. Standing principle: never let a back/exit action drop a user out — see memory `whatslocal2-no-user-drop`.

- **Listing-detail UX batch.** Visitor badge → "**{n} Local Visitors Today**". Bottom area reworked (Option B): small **Contact** + **Share** (forward-arrow icon) on one row, **More <category/kind>** below, with the persistent footer on every page (Home lives there, removed the separate Home button). **Share** composes a rich WhatsApp message (icon + title + sub + category + area + link) — the link-unfurl OG card is deferred (needs server-side meta + an image decision). **WhatsApp** uses the real green logo everywhere; posting reveals an optional separate WhatsApp number when you uncheck "WhatsApp" on the contact mobile (moved out of "More"). Hindi "More" label → "अन्य". Business category picker now peeks a half-row (uniform tile height + 2.5-row max-height) so it reads as scrollable.

## 2026-06-23 — Edit uses the SAME form as create (Post form is now create+edit)
- **Edit = the create UI.** Deleted the separate `AdminListingDetail` layout; the **Post form** now handles create AND edit (loads the listing into the same fields, same order). `/edit/:id` (owner) and `/admin/listings/:id` (admin, via `AdminPost` wrapper with AdminNav) both render `<Post>`; edit mode is detected from `useParams().id`.
- **Post-type locked on edit:** the "What are you posting?" field becomes a read-only "🔒 can't change" row, and the job seeker/hiring sub-toggle is disabled. `buildPayload` preserves the original `post_type` on edit.
- **Submit:** owner edit → `updateMyListing` (→ pending, toast "Saved — sent for review", back to `/l/:id`); admin edit → `adminUpdateListing` (toast "Saved ✓", back to User View). No OTP on edit (owner must already be logged in — gated by `OtpLogin`). Admin sees **Approve / Reject** when status is pending.
- **Show/Hide toggle + toast:** a pill toggle in the edit header flips `active` via `setMyListingActive`/`setListingActive` and shows a toast **"Post Visible" / "Post Hidden"**.

## 2026-06-23 — Post form rules (business) + pincode/city grouping
- **Full description** moved OUT of "More details" into the main business essentials (always visible). **Short description** and **at least one category** are now **mandatory** for a business post (frontend `validate()`); pincode **defaults to 441601** (editable).
- **City = district, not pincode.** `resolvePin` sets `city = District`. Verified both Gondia pincodes resolve to district **"Gondia"** (441601 & 441614). Listings group by city NAME, so a 441614 listing automatically shows under Gondia alongside 441601 — no special handling needed for a multi-pincode city.

## 2026-06-23 — Multi-category listings (up to 3, equal) + IT/Marketing split
- A business can pick **up to 3 categories, all equal (no primary/secondary)** — for multi-hat owners (the "anchor + influencer + dance teacher" case). The listing is **listed in each** category's home section + browse, and gains all their search synonyms. `MAX_CATEGORIES = 3`.
- **Model:** new `Listing.categories: string[]` (indexed). `category` (single) = `categories[0]` for back-compat (drives the card's one icon/eyebrow). `icon` = first category's emoji. `normalizeCategories()` validates/dedupes/caps at 3. Section/browse/search filter matches **array membership** (`{ categories: label }`). create + `adminUpdate` fold every chosen category's synonyms into the blob.
- **Pickers:** Post form + edit form category grids are now **multi-select toggles** (✓ on selected, cap 3, live n/3 counter). Verified: a 3-category listing appears under each category filter (API total=1 for each).
- **Anti-spam:** capped at 3; one card still shows one icon (the first), so multi-category doesn't visually spam.
- **Also:** split the old "IT / Software / Digital" into **💻 IT / Software / Web** and **📣 Marketing / PR / Social Media** (a coder ≠ a marketer) — now 39 categories.

## 2026-06-23 — Modern + traditional category labels (young audience) & ranking
- **Insight (owner):** the category LABEL is identity, not just a search key — a boutique owner won't self-list under "Clothing / Tailor"; a dev won't pick "Digital / Marketing". So labels now **lead with the modern/aspirational term while keeping the traditional one**. Relabels: Clothing/Tailor→**Fashion / Boutique / Clothing**, Restaurant/Food/Tea→**Cafe / Restaurant / Food**, Digital/Marketing/IT→**IT / Software / Digital**, Salon/Beauty/Spa→**Salon / Beauty / Makeup**, Cosmetics/Gifts/Fancy→**Cosmetics / Gifts / Skincare**, Gym/Fitness/Yoga→**Gym / Sports / Fitness**.
- **Modern vocabulary infused into synonyms** (so search + listing find them, and the right category is suggested): boutique, beautician, makeup artist, software developer, startup, freelancer, content creator, cafe, cloud kitchen, crossfit, pilates, nutritionist, dermatologist, modular kitchen, financial advisor, reels, ielts, gaming, skincare, k-beauty, hampers, etc. Traditional terms retained — "infuse modern with traditional".
- **Coverage tested:** 220 common + 59 modern terms → **0 gaps**; verified mappings (boutique→Fashion, software developer→IT/Software, cafe→Cafe, beautician→Salon/Makeup, crossfit→Gym/Sports, modular kitchen→Furniture…).
- **Fixed `searchCategories` false-match:** loose 2-way substring matched short synonyms ("ent" in "cont**ent**" → Doctor). Now the query→synonym direction requires synonym length ≥ 4.
- **Search ranking now CUMULATIVE** (was max-field): a term in MORE fields scores higher — title 10 + keywords 6 + short 4 + desc 2, so "fmcg" in title+keywords (16) beats one place. Order: coverage → cumulative field score → title exact/prefix → views → recency.
- **Card category eyebrow** now shows only in SEARCH results (mixed kinds); hidden inside a section/category where it's redundant.
- **Neutral icons:** all category icons are OBJECTS (gender/religion-neutral). Replaced the two people-icons: Salon 💇→**✂️**, Gym 🏋️→**💪** (verified: no category emoji depicts a person). Job-seeker cards still show 👨/👩 — that's the seeker's own stated gender (a feature you requested), not a category bias. 🍗 Meat is accurate to its category, not bias.
- **Edit form: category is changeable.** The admin/owner edit page (`AdminListingDetail`, non-job) now has the **icon-category picker** (search + grid) so the business category + icon can be changed on edit (patch sends `category`+`icon`; `adminUpdate` re-folds the new category synonyms into the search blob).

## 2026-06-23 — Category catalog, synonyms, home sections + admin drag-drop order
- **Single source of truth:** `BUSINESS_CATEGORIES` (key/label/emoji + **synonyms**) now lives in `@whatslocal/types` (used by web picker AND backend). Added **📐 Architect / Engineer / Interior** (38 categories total) — architects/civil engineers had no home before (fell to Other).
- **Synonyms (studied local search terms, Hindi/English):** each category has the words people actually type. (1) The **category picker/search** matches label OR synonym → "daily needs"→Grocery, "naksha"→Architect, "dawai"→Pharmacy (`searchCategories`). (2) Category synonyms are folded into each new/edited listing's `search_blob` so listings are findable by those words too.
- **Home = ordered sections** (plan 3): new `GET /home/sections?city=` returns admin-ordered sections — job **kinds** + business **categories** — each with its top listings (empty sections auto-hidden). Home renders these carousels; a category's "See all" → new **`/:city/cat/:key`** browse page (dense ROW list + in-category search + infinite scroll).
- **Admin "Home Order" tab** (`/admin/sequence`): **drag-and-drop** reorder of all sections (kinds + 37 categories), saved to a new `app_config` collection (`home_sequence`). `getHomeSequence` merges defaults so newly-added categories appear automatically. Backend: `GET/PUT /admin/home-sequence`. Section id format `kind:job_opening` | `cat:grocery`. Verified: reorder persists, sections return in order.
- **Search gained a `category` filter** (browse-by-category). **Caveat:** listings created before this (or under the old "Wholesale/FMCG"/"Grocery / Kirana" labels) won't match the renamed catalog labels, so their category sections show empty until re-saved — a label→key migration or re-categorize fixes it.

## 2026-06-23 — Natural-language search (stopwords, plurals, OR + coverage)
- **Problem:** "fmcg distributors in gondia" returned nothing — the strict AND matcher required every token, but "in"/"gondia" aren't in the keywords, "gondia" is the (already city-scoped) city, and "distributors"≠stored "distributor".
- **Fixes in `search()`:** (1) **stopword removal** — filler words (in/at/the/for/best/near…) AND generic retail nouns (shop/store/centre/point/mart/dukan) are dropped, since they match half the directory by title; (2) **city name dropped** from tokens (search is already city-scoped); (3) **naive depluralize** — a token ending in `s` also tries the singular (distributors→distributor); (4) **OR match + coverage ranking** — match docs hitting ANY token, rank by how MANY tokens matched (then field score → views → recency). Replaces the all-tokens-AND requirement.
- `relevance()` and the query path now operate on token **groups** (variants per token). Verified: "fmcg distributors in gondia"→Bharat top, "kirana store"→Maa Kirana top, "best namkeen shop in gondia"→Bharat (namkeen) top; earlier cases (paper/paperboat/tooyums/fmcg wholesaler) still top-rank correctly.

## 2026-06-23 — Reporting requires login + moderation tools
- **Reporting now requires login.** `POST /listings/:id/report` is `JwtAuthGuard`-protected; the detail page opens the OTP login popup if logged out. One OPEN report per (user, listing) — re-reporting updates, not duplicates. Reports store `reporter_mobile`. (Anon visitor_id path removed; "issues could be from any side" → every report is now accountable.)
- **Admin Reports redesigned, grouped by listing.** `GET /admin/reports` returns one group per reported listing with: the listing (status + hidden flag), **every reporter (mobile · reason · date)**, and **how many TOTAL reports that user has ever filed** (⚠ badge at ≥3 → spot serial/malicious reporters), plus the **action history**.
- **Moderation actions + audit:** `POST /admin/reports/:listingId/action` with `{action}` = `hide | show | restrict | unrestrict | reviewed`. Hide/show toggles listing `active`; restrict/unrestrict sets `User.blocked` on the **poster** (blocked users get 403 on create AND report); reviewed clears the listing's open reports. Every action is logged to a new **`mod_actions`** collection (`listing_id, target_user_id, action, admin, note, ts`) and shown as History on the card.
- New: `User.blocked` flag, `mod_actions` collection/schema, `AuthService.isBlocked/setBlocked/briefByIds`. Verified end-to-end: anon report→401, login report→grouped with reporter total, hide→public 404, reviewed→cleared, history retained.

## 2026-06-23 — Substring search + keywords hidden from users
- **Keywords are search-only, hidden from buyers.** Removed the "What they offer" keyword section from the listing detail page, and **stripped `keywords_cache` (and `search_norm`) from the public payload** (`toPublic`) so they can't be scraped. The Post keyword field now says "🔒 Hidden from buyers — used only to help people find you in search". (Minor: client icon-guesser no longer sees keywords; business listings rely on their picked category icon, else fall back to 🏪.)
- **Partial / glued search now works.** Old `$text` matched whole words only, so "paper"≠"paperboat" and "tooyums"≠too+yums. Replaced with **normalized substring matching**: new internal `search_norm` field = `search_blob` lowercased with all spaces/punctuation removed; a query is split into tokens (also normalized) and **each token must be a `$regex` substring of `search_norm`** (`$and`). In-app `relevance()` ranker also switched to normalized fields so it agrees. Verified: paper→paperboat, "paper boat"→paperboat, paperboat, **tooyums→too+yums**, and multi-word "fmcg wholesaler" all hit; keywordsLeaked=0.
- **Operational note / scale:** unanchored regex is a collection scan among city-filtered docs — fine at one-city scale (hundreds–few-thousand). At ~50k+ listings it degrades (regex can't use an index) → upgrade to **Atlas Search** (autocomplete/edgeGram+nGram analyzer), already the roadmap upgrade. Backfilled `search_norm` on existing 19 listings via a Node script (Atlas rejected `$regexReplace` — server < 4.2). `adminBrowse` still uses `$text` (admin tool, index retained).

## 2026-06-22 — Search relevance ranking (coverage → score → popularity → recency)
- **Problem:** Mongo `$text` `textScore` rewards repeating one matched term, so a listing matching only "namkeen" (×3) outranked one matching BOTH "paperboat" AND "namkeen".
- **Fix:** for a text query, `search()` now fetches a candidate pool (top 200 by textScore) and **re-ranks in the service** via `relevance()`:
  1. **coverage** — how many DISTINCT query terms the listing matches (primary; matching more terms wins).
  2. **score** — WHERE terms hit: title +10, keywords +6, short_desc +4, description +2, synonym-only +1; plus title exact +30 / prefix +15 / contains +8.
  3. **views** — popularity ("most visited"): new `Listing.views` counter, `$inc` on each genuine public detail view (`getPublic`, fire-and-forget, skipped for the owner's own preview). Stripped from public output (with `score`) in `toPublic`.
  4. **updatedAt** — newest as final tie-break.
- No-query browse path unchanged (newest first). Candidate pool capped at 200 (city-scoped → ample). Verified: a doc matching both terms ranks above one matching a single term repeated 3×.

## 2026-06-22 — Bilingual UI (English default + Friendly Hindi)
- **English is default.** First visit shows a language picker (`LanguageGate`, shown when no `wl_lang` in localStorage); switchable anytime via an **EN / हिं toggle in the Home header** (`LangToggle`). Choice persists in localStorage.
- **Hindi style = "Friendly Hindi"** (owner's pick): Devanagari script with everyday spoken words + common English loanwords (मोबाइल/कैटेगरी/पोस्ट/सर्च), **NOT शुद्ध Hindi**, NOT romanized. Keep WhatsApp/Call/OTP/brand and Western numerals as-is. Rationale: शुद्ध Hindi feels stiff and trips non-tech users; romanized looks cheap; friendly Devanagari is what actually gets used.
- **Infra:** lightweight, no library — `lib/i18n.tsx` (`LangProvider`, `useT()`, flat `key → {en,hi}` dict, `{n}`-style interpolation). Built so a 3rd language (Marathi — Gondia is in Maharashtra) is trivial to add later.
- **Translated so far (phase 1):** language picker, Home (header/search/sections/states), BottomNav, ListingDetail (all chrome + row labels + hours + contact + report + drawer), OtpLogin, MyPosts. **Still English (phase 2 TODO):** the Post form (largest), Categories page, CategoryPage filters, and the 37 business **category labels** (eyebrow shows stored English category). Admin stays English by design.

## 2026-06-22 — Category taxonomy overhaul (~37 buckets, trades clubbed)
- Rebuilt `CATEGORY_ICONS` from a ~200-business-type survey of a full Indian city into **~37 clear categories** meant to cover ~90% of shops/services/professionals; the long tail lands via keywords + "Other".
- **Key principle:** shops grouped by *what they sell*, services by *the job*. **Wholesale removed entirely** (it's a trade type, not a category — lives in keywords/short_desc + search).
- **Clubbing:** **Home Repair & Services 🧰** absorbs plumber/carpenter/electrician/painter/tiles/mason/welder/AC-RO repair/pest control/cleaning/tank-cleaning/locksmith (~10 trades → 1). Similar merges for **Automobile 🚗**, **Finance/Insurance/Loan 🏦**, **Events/Decoration/Catering 🎤**, **Education/Coaching 📚**, **Travel/Transport/Courier 🚕**. New buckets: Vegetables/Dairy 🥦, Meat/Fish 🍗, Cosmetics/Gifts/Fancy 🎁, Pathology 🧪, Govt/Aadhaar-PAN 📋, Laundry/Personal 🧺, Agriculture 🌱, Gas/Water/Solar 💧, Stationery 📒, plus Printing 🖨️/Digital 📣/Animal 🐾 from earlier.
- **Keyword guesser (`ICON_MAP`)** rewritten to route the ~200 types into these icons, ordered specific-first (service-trades before electronics so "electrician"≠electronics; farm terms before generic dairy; "driving school"≠school; "blood bank"≠bank). Verified 32/32 tricky cases route correctly.
- The Post category picker already has a **search box** (added same day) so 37 options stay easy to scan. Existing listings keep their stored category label/icon — non-destructive.

## 2026-06-22 — Business listings: short_desc (tagline) on cards
- Businesses now have **three text fields**: `title`, **`short_desc`** (one-line tagline, **27-char cap** so it fits a tile), and `description` (full, detail page).
- **Card subtitle** (`subInfo`) for a business shows `short_desc` **in full** (no clip — it's ≤27 chars) **in place of address**; address is the fallback only when there's no tagline. The tile subtitle wraps to 2 lines (`line-clamp-2`) so all of it shows.
- **Searchable:** short_desc is added to `search_blob` on **both create and edit** (`adminUpdate` rebuild), so a tagline-only word finds the listing.
- Wired through: `Listing.short_desc` type + schema (`default ''`), `Create`/`AdminUpdate` DTO `@MaxLength(27)` (no `@Matches`, so blank clears it), Post form (business: "Short description (shown on card)" + live n/27 counter; full field relabeled "Full description"), edit form (parity, non-job only), detail page shows it as a tagline above the full description.
- Verified: short_desc round-trips to the public card payload; **search by a word only in short_desc → 1 hit**; **28 chars → 400**.

## 2026-06-22 — Fix: Home goes blank (rate limit + empty-vs-error)
- **Symptom:** returning to Home from another page showed "Nothing yet — be the first to post" and stayed blank across refreshes for minutes.
- **Cause 1 — rate limit:** Home fires one `GET /listings/search` *per section* (4/load); the endpoint was capped at **40/min** and the global at 120/min. Navigating back-and-forth (remount = 4 more) + category infinite-scroll tripped the 60s window; every refresh fired 4 more and kept it tripped → 429s for minutes. Raised **search → 120/min**, **global → 240/min**. Sensitive routes unchanged (reveal 15, create 6) — that's where scrape protection matters; search results carry no PII. Verified: 50 rapid searches now all 200 (was throttling after 40).
- **Cause 2 — empty looked like error:** Home's per-section `.catch(()=>empty)` turned a 429/network failure into the empty state, and the empty state also showed during initial load. Now Home tracks `loadStatus` (`loading|error|ready`): shows "Loading…" before data, **"Couldn't load — retrying…" + auto-retry (2s,4s,6s… backoff) + Tap to retry** on failure, and "Nothing yet" **only** after a successful load with zero results. A transient blip can no longer leave the page falsely blank.

## 2026-06-22 — Admin "＋ Post" (publishes immediately, no approval)
- New **＋ Post** tab in `AdminNav` → `/admin/post`, renders the **exact same `<Post>` form** users get, in `admin` mode.
- **Admin mode differences:** no OTP step (the server trusts the admin token), uses **`POST /admin/listings`** (AdminGuard, admin-token routed) instead of `POST /listings`, success copy "Posted & published / It's live now", contact-number helper reworded (no OTP sent).
- **Backend:** `listings.service.create` now sets **`status: 'approved'` + `approved_by`/`approved_at`** when `role === 'admin'` (was always `pending`); the existing admin source/`posted_by_mobile:''` audit stays. The owner contact-number ownership check was already skipped for admin.
- Verified: admin create → `status=approved`, shows in public search instantly, phone still stripped (`phoneLeaked=false`).

## 2026-06-22 — Admin "User View" is the real Home (true mirror)
- The admin **User View** tab now renders the **exact same `<Home />`** component users see (wrapped in `AdminNav` + given `adminPreview`), so it can never drift from the live user experience — any change to the user view shows up here automatically. Replaced the old bespoke flat list.
- **Only differences in preview:** the admin top nav stays visible (to switch Dashboard/Approvals/Reports), and the user-only bottom-nav actions (**My Posts**, **Post**) are rendered but disabled (greyed, non-clickable) via `BottomNav preview`. Home/Categories/search/listings behave exactly as for a user.
- **Trade-off:** the old per-row **Hide/Show + Edit** chips are gone from this page (it's now a pure mirror). If inline moderation is wanted, add a Hide/Show toggle on the admin listing detail (`/admin/listings/:id`) — the `setListingActive` endpoint still exists.

## 2026-06-22 — Owner (and admin) can edit a listing from its page
- The public detail page (`/l/:id`) shows an **Edit** button when the viewer **owns** the listing (`can_edit` from the server — set if the requester's token's user id == `posted_by_user_id`) **or is admin** (detected client-side).
- **Edit destinations:** admin → existing `/admin/listings/:id`; owner → new **`/edit/:id`** (OTP-gated). Both reuse the same edit form (`AdminListingDetail` now takes `mode: 'admin'|'owner'`).
- **Backend:** `GET /listings/:id/full` + `PATCH /listings/:id` (JwtAuthGuard, owner-or-admin ownership check). **Owner edits set status back to `pending`** (admin re-reviews; the listing drops from public until re-approved). `getPublic(id, requesterId)` adds `can_edit`. Verified: owner edits OK (→pending), `can_edit` true/false correctly, non-owner PATCH → 403.
- **Blank-field validation fix (2026-06-22):** edit forms submit untouched optional fields as `""`, but `@IsOptional()` only skips `null`/`undefined`, so a blank `@Matches` field (e.g. `whatsapp`) failed with "whatsapp must match …". Added a shared `@BlankToUndef()` (`class-transformer` `@Transform`, runs because the global `ValidationPipe` has `transform:true`) on every optional `@Matches` field in both DTOs (whatsapp, cta_url, cta_url2, dob, admin mobile/pincode) → blank coerced to `undefined` = "not provided", leaves the existing value unchanged. Verified: payload with empty whatsapp/cta_url/dob → 0 validation errors.

## 2026-06-22 — City-scoped shareable URLs
- **`/:city` → city home, `/:city/:kind` → category page** (e.g. `/gondia`, `/gondia/job-opening`) so links can be shared per-city/per-section in groups. Kind URL slugs: `job-opening`, `job-seeker`, `business`, `happening` (`lib/city.ts` maps slug↔kind). City resolved from `lib/city.ts` `CITIES` (only `gondia` for now; unknown → default). `/` still works (default city). Static routes (`/post`, `/my`, `/categories`, `/l/:id`, `/admin/*`) rank above the dynamic `/:city` in React Router, so no conflict. Home section "See all"/"more" + CategoryPage back-link use the city-scoped URLs. Verified deep links serve the SPA (vite preview 200).
- **Prod note:** static hosting (nginx) needs an SPA fallback — `try_files $uri /index.html;` — so deep links like `/gondia/job-opening` don't 404 on refresh/share.

## 2026-06-22 — Inflated visitor count + category-icon picker
- **Visitor count is inflated server-side** (real count never leaves the server): `shown = floor(INFLATE_BASE + real × INFLATE_MULTIPLIER)`, env-tunable. Set to **7.63×** (BASE 0). Admin analytics still shows REAL numbers. Recommendation: set `INFLATE_BASE` to a floor (~80–150) so quiet mornings/zero-traffic don't show a tiny/0 number; optional time-of-day ramp can be added for organic feel.
- **Category-icon picker** on the business posting form: a grid of ~25 categories (`CATEGORY_ICONS` in listingMeta), each an icon+label; the poster taps one → stored as `category` + `icon` on the listing. `iconFor()` now uses the chosen `icon` first, then falls back to the keyword guess. This makes icons reliable across hundreds of shops + gives a real category for future browse/filter. Verified stored.

## 2026-06-22 — "Visitors today" + header restructure + Sports category
- **Live "X visitors today" badge** top-left of the home header (green pulse dot). Public endpoint `GET /stats/visitors-today?city=` → distinct **`session_id`** in `events` since local midnight (optionally city-filtered); non-sensitive aggregate, then inflated.
- **Count is VISITS, not unique people** (changed 2026-06-22): we count distinct `session_id`, not `visitor_id`. `session_id` lives in `sessionStorage`, so it's stable across page changes within one visit (page navigation does NOT add to the count) but a brand-new visit gets a new id — so the same person visiting twice counts as 2. This intentionally yields a higher organic base before the 7.63× inflation. (Hard refresh keeps the same session; closing the tab/browser starts a new one.) Verified: 2 sessions → +15 inflated, 3 page changes in one session → +0.
- **Header restructured:** the **"WhatsLocal in Gondia ▾"** moved to the **top-right** and is now a button (city-selector placeholder) + text. The header **+ Post** was removed (Post lives in the bottom nav).
- **Sports & Fitness category** added to Home chips + Categories tiles (q "sports gym fitness") and the icon map (gym/fitness/sport/cricket/football/turf/academy → 🏋️).

## 2026-06-22 — Seeker home address (optional) + fuller detail page
- **Job seeker:** location field relabeled **"Address (home)"** and made **optional** (only hiring's "Job location" stays mandatory).
- **Detail page no longer looks blank** for sparse listings: added an **icon avatar header**, the empty details box is **hidden when there's nothing in it**, and the **Contact button is inline** (right under the content) instead of pinned to the bottom — which removed the big white gap. (Keywords still intentionally not shown on detail, per earlier decision — so businesses with only a name + keywords benefit from filling a description; see icon/category note.)

## 2026-06-22 — Job location field + red mandatory marks
- **Added the missing "Job location / area"** (hiring) / **"Your area / locality"** (seeker) field to the posting form → stored in the existing `address` field; shown as **Location** on the detail page. Made **mandatory** for jobs.
- **Mandatory fields now show a red `*`** — the `Field` component renders any trailing `*` in red, and `validate()` enforces the matching set:
  - Always: post-type, name/title, contact mobile (10-digit), pincode (6-digit).
  - Jobs: + job role + job location.
  - Non-jobs: + at least one search keyword.

## 2026-06-22 — Job filters on the category page (seekers + employers)
- **Filters live on the dedicated category page** (`/c/:kind`, reached via "See all / N+ more"). Job kinds show a filter bar:
  - **Job Seekers:** gender · age (18–25/26–35/36–45/45+) · experience (Fresher/1+/3+/5+ yr).
  - **Employers (openings):** gender required · experience required · salary (₹10k/15k/20k/30k+).
- Backend: `search()` gained job filter params (`gender`, `age_min/max`→dob bounds, `exp_min/max` on the right exp field per kind, `sal_min/max` overlap). DTO + controller pass them through. Verified each filter narrows correctly. Changing a filter resets + reloads the infinite-scroll list. Non-job categories show no filter bar.

## 2026-06-22 — Per-day working hours + user-hide-own-posts (My Posts)
- **Working days & timing = a 7-day schedule** (`WeekHours.tsx` + `DaySchedule` type + `week_hours` on the listing). Each day has an Open/Closed toggle + from–to time inputs; **Sunday defaults to Closed** (half-day = a short range). Replaces the old free-text `working_days`/`job_timing` in the hiring form + admin edit; shown as a schedule on the detail page (legacy free-text still falls back). Server sanitizes the array (`cleanWeek`).
- **Users can hide their own posts.** New **My Posts** tab (`/my`, bottom nav 👤) — OTP-gated; lists the user's listings with status (In review/Live/Rejected) + a **Hide/Show** toggle for live ones. Backend: `GET /listings/mine` (own posts, phone stripped) + `POST /listings/:id/active` (JwtAuthGuard, ownership-checked — admin may toggle any). Verified: owner hides → removed from public; non-owner → 403. Admin's own hide (User View) unchanged.

## 2026-06-22 — At-a-glance meta + swipe carousels + category page (infinite scroll)
- **Cards show 1–2 most-relevant facts with icons, by kind** (`meta()` in `lib/listingMeta.ts`): job-seeker → `👨/👩 age` + `🛠️ exp`; job-opening → `💰 salary` + `🛠️ exp req` (or `🕐 timing`); business → just location. Rest of the info lives on the detail page.
- **Home sections are horizontal swipe carousels** of compact `ListingTile`s (~10 shown) with a **"See all ›"** header link and a dashed **"N+ more →"** tile → the category page. (`ListingCard`/`ListingTile` share helpers from `lib/listingMeta.ts`.)
- **Dedicated category page** `/c/:kind` (`CategoryPage.tsx`): full list of that category with **infinite scroll** (IntersectionObserver sentinel, `rootMargin 300px`) paginating `searchListings('', city, kind, page)` (PAGE_SIZE 20) until `items.length >= total` — scales to thousands. Verified meta fields present + pagination stops cleanly.

## 2026-06-22 — Descriptive icons + home grouped by category (Jobs first)
- **Avatars are now descriptive icons, not first-letter** (looked like empty profile photos). `iconFor()` picks by kind (💼 opening, 🙋 seeker, 🎉 happening) then by keyword/title match (🩺 doctor, 🍴 food, 🛒 grocery, 💇 salon, 🏠 property, 📦 fmcg…), fallback 🏪. Soft hashed tint behind.
- **Home feed grouped into category sections** instead of one mixed list, ordered **Jobs first**: **Job Openings** (kind=job_opening) → **Job Seekers** (kind=job_seeker) → **Happenings** → **Businesses & Services**. Empty sections hidden; ≤6 shown per section. Each section fetched via `searchListings('', city, kind)`. Search still shows a flat result list.

## 2026-06-22 — Premium visual pass (color + cards + hidden scrollbar)
- **Hidden scrollbar:** added `.no-scrollbar` util in index.css; applied to the category-chips row.
- **Premium cards:** listing cards now have a **colored rounded avatar** (soft tint hashed from the id, emoji by kind / first letter), `shadow-card`, active-scale press feedback, and a 📞 hint when a number exists.
- **Color / theme:** Tailwind palette extended (`brand` 50/100/dark, `accent` amber, `shadow-card`). Home + Categories got a **teal→teal-dark gradient header** (rounded-b-3xl) with a white search card; Categories tiles are soft-tinted per category. Light slate base behind white cards. Reference feel: Blinkit/CRED (clean, colorful, premium). Brand accent stays teal `#0f766e`.

## 2026-06-22 — Bottom nav (Home · Categories · Post)
- Added a fixed **bottom nav** (`BottomNav.tsx`, centered to the phone column) on Home + Categories: **Home / Categories / Post**, active tab highlighted.
- New **Categories** page (`/categories`): 3-col grid of category tiles → navigates to `/?q=<term>`. Home reads the `?q=` param (via `useSearchParams`) to auto-run that search (clear-✕ also clears the param).

## 2026-06-22 — User UI redesign: tap card → detail page (Blinkit-style, clean)
- **Compact tappable cards → full detail page.** `ListingCard` is now a clean, clickable preview (title + role/location + chevron, **no keywords**) → `/l/:id` (`ListingDetail`) showing full info: description + structured fields (salary/timing/working-days/gender/experience/languages for jobs; age/gender/about for seekers; address/hours/website for business). **Keywords are never shown** (search-only). The **contact drawer moved to the detail page** (sticky "📞 Contact" bar → bottom sheet; number still never shown; clicks tracked; `listing_view` event on open).
- **Home cleaned up (Blinkit-style):** sticky header (City ▾ + Post), light search bar with clear-✕, horizontal **category chips** (Jobs/Food/Shops/Services/Health → run a search), and a tidy "Recently added" list of compact cards. Less text, more whitespace.

## 2026-06-22 — Admin "User View" + hide post + contact drawer (click-tracked)
- **Admin "User View" tab** (`/admin/user-view`): browses listings exactly as users see them (uses the public `ListingCard`), **including hidden ones (greyed)**, with a **Hide / Show** toggle + Edit link per card. Backend: `GET /admin/listings/browse` (approved, active+inactive, public projection + `active`), `POST /admin/listings/:id/active`.
- **`active` flag** (default true) on listings — admin can **hide** an approved listing from users without rejecting it. Public search/detail/reveal all filter `active: { $ne: false }` (legacy docs w/o the field count as active). Verified: hide → drops from public (12→11) + reveal 404; show → restored.
- **Contact drawer (number NEVER shown):** the card now has a **📞 Contact** button → tapping it does ONE metered reveal then opens a **bottom sheet** with **Call / WhatsApp (per the enabled flags) / Copy**. The raw number is held in memory and used by the action (`tel:`, `wa.me/91…`, clipboard) but is **never rendered on screen**.
- **Click tracking for future monetization:** every option tap fires a `contact_click` analytics event with `target` (`open`/`call`/`whatsapp`/`copy`) + `listing_id` + `visitor_id`. This is the data for **(a) charging listings per contact click** and **(b) restricting contact views per user** later — the reveal metering (anon 3/day → login, daily cap) already enforces a basic per-user limit today. Verified events recorded.

## 2026-06-22 — Removed admin Keywords management page
- Since keywords are now free (no dictionary requirement / approval), the admin **Keywords** tab had nothing to manage → removed: `AdminTags.tsx`, the nav tab + route, the web tag-admin helpers, and the backend admin tag endpoints (`/admin/tags` GET/POST/PATCH/DELETE, `:id/approve`) + their service methods + `UpdateTagDto`.
- **Kept:** the public `GET /tags` **autocomplete** (consistent common suggestions in the posting keyword box), `tags` collection + seed, and `TagsService.search`/`byIds`. Admin nav is now Dashboard / Approvals / Reports. (Autocomplete can be dropped too for pure free-typing if desired.)

## 2026-06-22 — Home browses approved listings by default
- Reported: "approved a business but it didn't appear on user page." Root cause was **not** a bug — the listing was approved + searchable; the home was **search-only** (empty until you searched). Fixed: the home now loads & shows **"Recently added in {city}"** (approved listings via `searchListings('', city)` → no-q returns approved by updatedAt) below the search bar. Search behaviour unchanged.

## 2026-06-22 — Admin listing View/Edit (full page)
- Approvals cards got a **View / Edit** button → full-page admin detail at `/admin/listings/:id`.
- Backend: `GET /admin/listings/:id` (AdminGuard) returns the **full document** (incl. phone, dob, metadata — admin-only, not the public projection); `PATCH /admin/listings/:id` (AdminGuard, `AdminUpdateListingDto`) edits any field and **re-derives geo (if pincode changed) + the search index** (search_blob/keywords_cache from title/keywords/role/description). Approve/Reject also available on the detail page. Verified: edit title+keywords → search by the new keyword hits.

## 2026-06-22 — Dead-code cleanup + per-category title label
- **Per-category title label.** The DB field stays `title`, but the form's label + placeholder change per category so the user knows what to enter: Business/Org → "Business / Organisation name", Sell → "What are you selling?", Happening → "Headline / Title", Job seeker → "Your name", Hiring → "Business / Organisation name", Others → "Title". (`TITLE` map in Post.tsx.)
- **Dead code removed:** deleted `KeywordPicker.tsx`; removed `deals_in` entirely (types/schema/dto/service/card — superseded by free keywords); removed the dead `/tags/suggest` (co-occurrence) and `/tags/request` (per-keyword approval) endpoints + their service methods + `RequestTagDto` + the now-unused Listing-model injection in TagsService/TagsModule + the unused `suggestTags`/`requestTag` web helpers. `/tags` (autocomplete) and admin tag CRUD remain. All builds clean.

## 2026-06-22 — Free keywords (no tag approval) + PIN verify + contact flags + numeric guards
- **Keywords are now FREE words — no dictionary requirement, no per-keyword approval.** Reason: keywords run into the thousands (brands/products); per-keyword approval doesn't scale and is redundant since the **listing already goes through admin approval** (admin reviews keywords there). The dictionary stays only as optional autocomplete. Supersedes the earlier "controlled tags + request-approval" decision (request flow still exists but isn't used by the post form). **Space or Enter** splits each word into its own chip (fixed the "whole phrase = one keyword" issue). Max 25. Verified: each free word individually searchable.
  - Future spam control: an admin **blocklist** of banned words, not per-keyword approval.
- **PIN → city/state verification:** posting form resolves the pincode live (RG India Post proxy) and shows "📍 City, State" (or "PIN not found") so the user confirms it's right.
- **Call / WhatsApp availability:** the contact number has two checkboxes (`call_ok`, `whatsapp_ok`), **both default on**. Public-safe flags; reveal returns them; listing card shows Call and/or WhatsApp (wa.me) accordingly.
- **Input guards:** pincode and mobile accept **digits only** (alpha stripped on input); salary/experience are numeric. "Apply similar checks elsewhere" — done for the numeric/identifier fields.

## 2026-06-22 — Jobs redesigned (full info, auto keywords) + DOB→age privacy
- **Jobs don't ask for keywords.** Hiring + seeker auto-carry default bilingual job keywords (`job/naukri/vacancy…`) + the **role** (`job_role`, required) → generic and role searches both work. Verified: driver/cook/naukri/job/vacancy all hit.
- **Hiring form redesigned:** the name field is now **Business / Organisation name** (was "Title"); added **Job description**, **Gender required** (default Both), **Working days**, plus existing Timing/Salary/Experience/Languages. New fields: `job_role`, `working_days`, `gender_required`.
- **Seeker form:** Your name (+ hide) · Work you do (`job_role`) · DOB · Gender · Experience · About.
- **🔒 Privacy: exact DOB never public** — API returns derived **`age`** only (`toPublic` strips `dob`; `PublicListing` omits dob, adds age). Verified dob absent. (Same exclude-by-default lesson.)

## 2026-06-22 — Merged categories, single 25-keyword field, Happening type
- **One "Search keywords" field (max 25)**, merging the old controlled-keywords picker + "what you deal in" box. Type → Enter → chip. Dictionary matches become structured tags; others are `free_keywords`. No punctuation (letters/numbers/space/&/-). At least one required, ≤25 total (anti-stuffing; competitor-gaming risk was the reason to cap, not 100). Both feed weighted search; admin sees all keywords at approval (the spam check). Verified: free-keyword search works, 26→400, punctuation→400.
- **Merged business+service+ngo → one "Business / Service / Organisation"** option (same kind + pool; simpler for older users). `service`/`ngo` kept as legacy values. Dropdown now 6: Business/Service/Organisation, Sell or Rent, Hiring, Looking for a job, Happening, Others.
- **New `happening` type + kind** — "Happening — Events / News / Information". All happenings go through normal admin approval (= news moderation by default). Verified end-to-end.
- Recommendations recorded: don't separate Celebrations (fold into Happening/Events); candidate future categories from unmet needs — Real Estate, Govt/Civic, Emergency/Helpline, Lost & Found, Education/Admissions, Matrimony(out of v1).

## 2026-06-22 — Post-time OTP (no upfront login) + mobile prefill fix
- **No upfront login gate on `/post`.** User fills the form, then on **Post**: not-logged-in → OTP sent to the entered contact number, entering it logs them in AND submits in one step; own-number-logged-in → submits directly; different number → OTP-verify that number (mobile_token), stay logged in as own. Simpler for first-time posters.
- **Fixed mobile prefill bug:** the form initialized before login so the contact field was blank. Now prefilled from the session (init + effect). Contact field shows "Your number — verified" vs "We'll send an OTP here when you tap Post".

## 2026-06-22 — Brand search (deals_in), reports, keyword edit
- **Search inputs = keywords + a simple "what you deal in" box** (`deals_in`), NOT a forced long description (posters are ~50, simplicity first). `deals_in` is free text of brands/products → fed into search. Verified: Bharat Traders found by `paperboat`/`bikaji`/`patanjali`/`FMCG`/`snackible`.
- **Weighted relevance:** `search_blob` = title×2 + keywords×2 + synonyms + deals_in + description; sorted by textScore so best matches rank first. Atlas Search later for fuzzy.
- **Report listing:** public `POST /listings/:id/report` (reason enum + details) → `reports` collection → admin **Reports** page (`/admin/reports`) to review + mark reviewed. Verified.
- **Keyword edit:** admin `PATCH /admin/tags/:id` (name/synonyms/group/kind); inline edit on the Keywords page. Verified.
- `deals_in` IS public (it's marketing); phones/audit remain stripped.

## 2026-06-22 — Posting templates + OTP login + audit metadata
- **Posting type = dropdown of 7 templates** (`post_type`): business, service, ngo, sell, hiring, job_seeker, other (replaces 3 chips; "all others" became these granular templates). Server derives `kind` from `post_type`. (`POST_TYPES`/`postTypeToKind` in types.)
- **Posting requires OTP login.** OTP is **`1234` for everyone** (`DEFAULT_OTP`) until a real SMS provider. `/auth/otp/request` + `/auth/otp/verify` → user JWT (role `user`, keyed by mobile).
- **Contact-number rule:** mobile pre-filled with the logged-in user's number (already verified). Changing it requires OTP-verifying the new number (`/auth/number/verify` → `mobile_token` sent with the post). User stays logged in as their own number (can post for others). **Admin exempt.** Verified end-to-end (no-login→401, own→ok, other-no-token→400, other-with-token→ok).
- **Audit metadata** on every listing: `posted_by_user_id`, `posted_by_mobile`, `source`, `approved_by`, `approved_at`, timestamps. Admin-only.
- **🔒 Privacy fix (caught in testing):** public projection now also strips `whatsapp` (it's a phone number) and ALL audit fields (`posted_by_mobile` etc.). Lesson recorded in SECURITY.md: any new field is excluded-by-default from public payloads. Re-verified: zero phone/audit leakage.

## 2026-06-22 — Full build: hardening + listings/search + posting + admin approval
Built and verified end-to-end:
- **Hardening:** helmet headers, CORS allowlist (`CORS_ORIGINS` env), global rate limit (120/min/IP via `@nestjs/throttler`) + tighter per-route limits, global `ValidationPipe({forbidNonWhitelisted})`. CORS/JWT-secret rotation still owner TODО for prod.
- **`tags`** collection + module: public type-ahead (`/tags`), co-occurrence `/tags/suggest`, public `/tags/request` (→ pending), admin CRUD/approve. Seeded 57 starter keywords.
- **`listings`** collection + module: public `POST /listings` (→ pending, validated DTO), `GET /listings/search` (approved-only, **server-side projection strips phone**, paginated ≤20, Mongo text index on title+keywords+desc), `GET /listings/:id`.
- **Gated phone reveal** (`reveals` collection): `POST /listings/:id/reveal` meters per visitor/day — anon free up to `REVEAL_ANON_LIMIT` (3) then 401 LOGIN_REQUIRED, hard cap `REVEAL_DAILY_LIMIT` (5) → 429. Verified: phone never in search payload (`mobileLeaked=false`), reveal #4 blocked.
- **Title masking** verified: `Rajesh Kumar` + hide_title → `R*** K***` (server-side; real title never sent).
- **Admin approval queue** (`/admin/approvals`) + **keyword management** (`/admin/tags`), both AdminGuard.
- **Web:** integrated search results + reveal button, posting form (kind-aware fields + KeywordPicker w/ type-ahead, suggestions, request-new), admin nav. User app stays mobile-only; admin responsive.

## 2026-06-21 — Privacy, premium UI, posting fields, .bat launcher
- **Phone numbers hidden & secured:** never in public payloads; `PublicListing` exposes only `has_phone`. Reveal via a future gated action. **Gating (enforce later):** N numbers/day, and after ~10 min in app or ~3 reveals require login for the next. Architecture supports metering anonymous visitors now. See [PRIVACY.md](PRIVACY.md).
- **Hide-title option** (esp. job-seeker candidates): public sees each word's first letter + exactly `***` (3 asterisks, any length). Shared `maskTitle()` so backend+web match. Real title never sent when hidden.
- **UI direction: Google-clean** — minimal text, lots of whitespace, premium feel. Home redesigned to a single prominent pill search + quiet icon shortcuts.
- **Posting fields captured** (become filters later): job_seeker → dob/age, gender, experience_months, experience_description; job_opening → timing, off_days, salary range, experience_required, languages. Added to the shared `Listing` type now; forms/filters built with the listings API. See [POSTING.md](POSTING.md).
- **Desktop launcher:** `E:\DATA\DESKTOP\whatslocal-start-localhost.bat` (mirrors RG's; portable node from RG `.tools`, two persistent windows). Backend :9100, web :5180.

## 2026-06-21 — Device rules + admin auth
- **User app = mobile-only**; **admin = responsive** (mobile + PC). User app is centered in a phone-width column on desktop.
- **Public home, no login** — the domain lands straight on the city search. User login rules deferred ("set later").
- **Admin login built:** JWT (`@nestjs/jwt`) + bcrypt; `users` collection (role `admin`). `POST /auth/login`, `JwtAuthGuard`/`AdminGuard`. `/analytics/summary` is now admin-only; `/events` stays public. First admin seeded via `scripts/seed-admin.cjs` (username `admin`, generated password shown once). Verified: no-token→401, wrong-pass→401, valid→data.
- **Admin dashboard** at `/admin` shows the analytics summary (visitors/sessions/devices/top + zero-result searches). See [AUTH.md](AUTH.md).
- Added deps: backend `@nestjs/jwt` + `bcryptjs`; web `react-router-dom`.

## 2026-06-21 — Monorepo scaffolded + analytics from day one
- **Scaffold built and verified.** pnpm+Turbo monorepo: `@whatslocal/backend` (NestJS, :9100), `@whatslocal/web` (React+Vite+Tailwind, :5180), `@whatslocal/types`. Both build; backend connects to `whatslocal2_0` (health state=1); pin-lookup returns Gondia live; analytics ingest→summary verified.
- **Analytics is first-class from commit 1** (owner plans ~10 updates/day for a month). One `events` collection; browser `sendBeacon` → `POST /events`; server stamps ts, parses device from UA, captures ip. `GET /analytics/summary` rolls up visitors/sessions/by_type/devices/top_searches/**zero_result_searches**/by_day. See [ANALYTICS.md](ANALYTICS.md).
- **Highest-value metric = zero-result searches** — a direct to-do list of what to add next.
- **Central name wired through code:** backend reads `brand.config.json` at runtime (`/config`); web imports it via the `@brand` Vite alias. Rename = one file.
- **Tooling quirk:** local pnpm ignored esbuild/@nestjs/core build scripts → `pnpm rebuild esbuild @nestjs/core`. Backend needs `strictPropertyInitialization:false` (NestJS Mongoose-schema convention).

## 2026-06-21 — Featured shortcuts + JOBS tile
- City home = search bar (primary) **plus** a short row of curated **"most-used" shortcut tiles**. Featured set is admin-defined and small; more tiles defined later.
- **JOBS is a featured tile** → opens the jobs area: user picks **Post Resume** (seeker) or **Post Job Opening** (employer); both browsable/searchable. (Resolves the earlier "jobs vs business" question: unified search underneath, but JOBS gets a prominent dedicated entry point.)

## 2026-06-21 — Search-first product + "Keywords" + smart suggestions
- **Local search engine is the primary UI.** Open a city → search bar → search anything ("Parle biscuit", "saloon", "food license"…). Not category-browse-first.
- **Search engine = Atlas Search** (included with Atlas): typo tolerance, relevance, synonyms, one query over title+keywords+description. Fallback: Mongo `$text` + synonyms.
- **Call tags "Keywords" in the UI** — users don't understand "tags"; "Keywords" = "what people search to find you". Data model stays `tags`.
- **1–10 keywords per listing** (min 1, max 10).
- **Relational keyword suggestions:** after 2–3 keywords picked, suggest co-occurring keywords from existing approved listings (co-occurrence map refreshed on approval).
- **Mandatory posting fields:** title, mobile, pincode, ≥1 keyword. Common optional fields documented in DATABASE.md.
- **New keyword creation needs admin approval** (same queue as listings).

## 2026-06-21 — Tags over categories + reuse RG ERP pincode resolver
- **Tags, not single categories.** A listing carries many tags at once (doctor + hospital + cardiologist + …). Many-to-many `tags` ↔ `listings`. Supersedes the earlier `categories` tree idea below.
- **Controlled tag dictionary, not free text.** Users pick from a curated list; a missing tag is a *requested tag* routed through the same admin approval as listings. Prevents duplicate/misspelled tag chaos. Optional `primary_tag_id` for landing pages/SEO; optional `group` for browse. Search = title + tags (+ synonyms).
- **Pincode resolution = reuse RG ERP.** RG already proxies India Post `api.postalpincode.in` server-side (`utility.module.ts`), handling no-CORS + expired-TLS. Lift it almost verbatim; extend to surface district + state + locality (RG collapses city≈district). **Decision: live API via RG's proxy, NOT an offline dataset.**

## 2026-06-21 — Product defined + categories approach
- **Product:** a city-wide Yellow Pages — a database of every business / commercial / non-commercial service in a city — plus a **jobs** directory (seekers + employers). Starts with Gondia (441601/441614), expands city by city via user submissions + admin approval.
- **Geo by pincode:** users/admin enter a pincode; system resolves city/district/state (India Post data); approved cities cached in `cities`.
- **Categories are DATA, not code** (the answer to "how to handle 100s of categories"): a single self-referencing `categories` tree collection (2–3 levels, `kind: business|job`, `synonyms` for search). One listing form references category IDs — no per-category code. UI is a **type-ahead search**, not a flat dropdown. Admin manages the taxonomy without deploys. Seed with a starter taxonomy, grow on demand.

## 2026-06-21 — Project bootstrapped
- **New, separate project.** WhatsLocal 2.0 is distinct from the original `whatslocal` job-marketplace at `E:\DATA\DESKTOP\whatslocal`. New folder: `E:\DATA\DESKTOP\whatslocal2.0`.
- **Shared Atlas cluster, own database.** Uses RG ERP's Atlas cluster but a dedicated database `whatslocal2_0`, isolated from `RetailGridDB`. Rationale: deploy on the same infra / reuse the cluster to save server resources, without risking RG ERP's live data.
- **DB name normalization.** Requested name `whatslocal2.0` is illegal in MongoDB (`.` not allowed); used `whatslocal2_0`. Folder stays `whatslocal2.0`.
- **First collection `details`** holds all setup/config.
- **Stack = RG ERP's stack** (pnpm+Turbo, NestJS 10 + Mongoose 8, React 18 + Vite 5 + Tailwind, TS) so backend + frontend run on a single EC2.
- **Centralized project name.** The brand/project name lives only in `brand.config.json`; renaming later is a one-file edit. Domain not purchased yet but available (`domain: null`).
- **Docs convention.** Multiple `.md` files under `docs/` (mirrors BT 2.0 / RG ERP), kept as living documents.
- **Hosting.** Web app served on a link, same model as BT 2.0 / RG ERP.
