# Posting & Fields

## Form structure (redesigned 2026-06-22; photos added later) — Top essentials + "More details"
Every form shows only the **most-needed fields at the top**; everything else is under a collapsible **"＋ More details (optional)"** toggle. Icons used throughout. **Photos are now supported on every type** (see "Photos" below). A **user-defined CTA button** (label + link, e.g. "Shop Now" → URL) is available on non-job types (under More). Per type:

| Type | Top (essentials) | More details |
|---|---|---|
| **Business / Service / Org** | category-icon picker, name★, mobile★+call/wa, pincode★, address/area, keywords★, photos | about, **open hours** (week schedule), established year, CTA, whatsapp/email/website |
| **Sell or Rent** | **Sell vs Rent★**, category (mode-filtered), name★, price (+`rent_period` if rent), mobile★, pincode★, keywords★, photos | description/condition, negotiable, address, CTA, contacts |
| **Hiring** | org name★, job role★, pincode★, area/location, mobile★, salary min–max, **gender required★**, experience (yes/no → months), photos | job description, job type, optional age from/to, **office timing (opt-in checkbox)**, languages, CTA, contacts |
| **Looking for a job** | name★ (+hide), work you do (skills)★, experience, gender★, DOB, mobile★, pincode★, photos | about, expected salary, job type, languages known, home address (optional), CTA, contacts |
| **Happening** | type (Event/News/Info)★, headline★, then per type (see below), mobile★, pincode★, keywords★, photos | details, CTA, contacts |
| **Others** | title★, mobile★, pincode★, keywords★, photos | description, CTA, contacts |

★ = mandatory (red `*`, enforced in `validate()`).

## Photos (all types)
- **`PhotoPicker`** on every post type. Uploads happen **immediately on select** via `POST /listings/upload` (JWT-gated — logged-out users see a "log in first" prompt); each tile shows a spinner while uploading, then a × to remove. **The first photo is the cover** (used on the detail gallery, feed/search tiles, and the WhatsApp share card).
- Server re-encodes ONE image into a compressed `view` + `thumb` with **EXIF (incl. GPS) stripped**; only the returned **key** goes into `photos[]` (`p`+16 hex, ≤ 8). See [ARCHITECTURE.md](ARCHITECTURE.md) media pipeline + [PRIVACY.md](PRIVACY.md).
- Client-side size guard (`MAX_PHOTO_BYTES`); server also caps upload at 8 MB / 1 file.

**Custom CTA button:** `cta_label` (≤24 chars) + `cta_url`. The URL is **http(s)-only** (DTO `@Matches(/^https?:\/\//)`, frontend auto-prefixes `https://`) — blocks `javascript:`/`data:` XSS. Rendered on the detail page as an outlined button (`target=_blank rel=noopener`); taps logged as `contact_click target=cta`. New listing fields: `cta_label,cta_url,price,sale_or_rent,negotiable,vacancies,job_type,expected_salary,happening_type,event_date,established_year`. Verified stored + XSS blocked.

## Posting type = a dropdown (`post_type`) — 6 options (merged 2026-06-22)
business/service/ngo were **merged into one** ("Business / Service / Organisation") since they share the same `kind` + keyword pool — the *keywords* do the real classifying, and one option is simpler for older users.

| post_type (UI) | label | → kind |
|---|---|---|
| `business` | Business / Service / Organisation | business |
| `sell` | Sell or Rent something | business |
| `hiring` | Hiring — post a job opening | job_opening |
| `job_seeker` | Looking for a job | job_seeker |
| `happening` | Happening — Events / News / Information | happening |
| `other` | Others | business |

**Dropdown UI (5 entries)** groups the two job types: Business / Service / Organisation · Sell or Rent · **Jobs — looking or hiring** · Happening · Others. Picking **Jobs** reveals a toggle — **"Looking for a job" (default)** or **"Hiring (post a job)"** — which sets the real `post_type` (`job_seeker`/`hiring`). Backend is unchanged.

`service`/`ngo` remain valid values for back-compat with old data but aren't shown. Server derives `kind` from `post_type` (never trusts client). `@whatslocal/types`: `POST_TYPES`, `postTypeToKind`. **Note:** all `happening` posts go through admin approval like everything else — that's the moderation for "news".

## Search keywords — ONE field, FREE words, max 25 (updated 2026-06-22)
A single "Search keywords" field of **free words — no dictionary requirement, no per-keyword approval** (keywords run into the thousands; the listing's admin approval is the review point). **Space or Enter** splits each word into its own chip. No punctuation (letters/numbers/space/&/-). Max 25. Stored in `free_keywords`; fed into `search_blob`. The dictionary (`tags`) remains only as optional autocomplete. Jobs don't use this field at all (auto keywords). `MAX_KEYWORDS` in types.

## Contact section (posting form)
- **"Number for Calling"** and **"Number for WhatsApp"** sit **side by side**. The WhatsApp field **mirrors the calling number** while "Same as calling" is ticked (default); untick it to reveal a separate optional WhatsApp number.
- Two public-safe flags `call_ok` / `whatsapp_ok` (**both default on**) — the listing card shows Call (`tel:`) and/or WhatsApp (`wa.me/91…`) after reveal based on these.
- **OTP-verify flow:** the contact number is verified via OTP (own logged-in number needs none; a different number needs its own OTP → `mobile_token`). See [AUTH.md](AUTH.md).
- Photo uploads sit in the same essentials area (see "Photos" above).

## Sell / Rent — mode-driven (`packages/types`)
The **first question is Sell vs Rent** (`sale_or_rent`, `'sale'|'rent'`). The category grid is then **filtered by mode** via `sellCategoriesForMode(mode)` — each `SELL_CATEGORY` carries `modes: ('sale'|'rent')[]`, so e.g. Books/Mobiles/Scrap show only under Sell, while **Cars, Bikes & Scooters, Cycles are rentable** too. **Property is one merged category** ("Property — House / Flat / Plot / Shop") for both sale and rent (PG/room/lease all fold in via synonyms). Switching Sell↔Rent **clears** the chosen categories (they belong to different mode sets). Rent adds a free-text **`rent_period`** field ("per month", etc.), which drives the share card's "₹X / period" line.

## Happening — Event / News / Info reshapes the form
Picking the Happening **type** (`happening_type`) up front changes the fields:
- **Event** → **event date** (`event_date`, free text) + **venue** (stored in `address`); details go under "More".
- **News / Info** → a **mandatory sub-heading** (`short_desc`, ≤ 80 chars) + a **mandatory body** (`description`), both surfaced up top (not buried in "More"). The News body is labelled "story", Info's is "details".
- The **title relabels per type** (e.g. Headline / Title).
- **`hide_number` defaults ON** for News/Info (the number is collected for OTP/ownership but never shown — see below), and OFF for Event.

## Hiring form — current shape/order
Field order: **Job Title** (the `title`, required) → **Role/Position** (`job_role`) → **Pincode** → **Area/Location** (stored in `address`) → **Mobile** (contact block) → **Salary** (min/max) → **Gender required** (`gender_required`, required, kept **up top**, not under More) → **Experience** (a yes/no toggle first; only if "yes" ask months → `experience_required_months`). There is **no "openings"/vacancies field** — it's removed from the UI (the `vacancies` field still exists in the schema/DTO as legacy data, but is never shown or collected). Under "More": job description, job type, optional **Age from/to** (`age_min`/`age_max`), **office timing** (opt-in checkbox, off by default → `week_hours`/`has_timing`), languages.

## Job role taxonomy — `JOB_CATEGORIES` (both Hiring & Job-seeker)
A deep role taxonomy in `packages/types`, **same `{key, label, labelHi, emoji, synonyms[]}` shape as `SELL_CATEGORIES`**, keys all `job_*` (**35 roles**): House Help/Maid, Cook, Driver, Delivery, Security Guard, Salesman, Cashier, Accountant, Receptionist, Office Boy/Peon, Data Entry/Computer Operator, Teacher/Tutor, Electrician, Plumber, Carpenter, Painter, Mason, Welder, Mechanic, Tailor, Beautician, Barber, Nurse/Ward Boy, Housekeeping, Waiter/Hotel, Labour/Helper, Warehouse/Loader, Telecaller/BPO, Factory/Production, Medical Rep/Pharmacy, Gardener/Mali, **Petrol Pump Attendant, Supervisor/In-charge, Recovery/Loan Agent, Farm/Agriculture Labour**, Other. Each carries deep **English + Hinglish + Devanagari + local** synonyms (e.g. maid → बाई, kaamwali, house help, housemaid…) so the picker matches "maid"/"बाई"/"house help" → House Help.

**Seeker↔owner boundary (deliberate):** the job taxonomy is for **hired/employee roles only**. Self-employed trades that run their own shop — **mobile/laptop repair, photography/videography studios** — are intentionally kept in the **Business/Services** taxonomy, NOT added as job roles. (AC/appliance-repair technician sits on the same line and is currently held out too.) `labelHi` leads with the word locals actually say (बाई, चौकीदार, बिजली मिस्त्री, नल मिस्त्री, बढ़ई, राजमिस्त्री, दर्जी, नाई, मजदूर, गोदाम, माली, चपरासी) for low-literacy recognition; emojis are distinct per role for icon-first scanning.

**⚠️ Known limit — Devanagari not searchable yet:** the main listing search normalizer (`norm()` in `listings.service.ts`) strips everything except `[a-z0-9]`, so **Devanagari query text is deleted** (typing `बाई` currently returns the whole directory, not maids). The Devanagari synonyms therefore work in the **form picker** but not in the main search — only the **Roman/Hinglish** synonyms filter. Fix pending (extend `norm` to keep `ऀ-ॿ` + reindex + guard empty-after-strip queries). Most users type Hinglish, so Roman coverage carries it for now.
- **One taxonomy for BOTH** openings and seekers (a hiring "Cook" and a job-seeking "Cook" share the role). Wired via the **shared `CategoryPicker`** (same UI as business/sell): placed right after Role/Position (hiring) and after "Work you do" (seeker). **Picking a role is required for jobs** (`validate()` → `post.err.jobCategory`). It stores into `f.categories`/`f.category`/`f.icon`.
- **Search folding:** `create()`/`adminUpdate()` job branches call `normalizeCategories()` and fold the chosen role's synonyms into `search_blob`/`search_norm` (same mechanism as business). Public `search()` already filters `?category=` against `categories[]`, so **role-based filtering of openings & seekers works with no change there** — this is how you filter e.g. "house help candidates" out of thousands.
- **Display:** the job tile/detail **eyebrow now shows the role** (e.g. "Cook") instead of a generic "Job Seeker" (via `categoryLabel()`, localized by `catLabel`), and the poster-chosen emoji shows on the tile (🍳). Legacy jobs with no role fall back to the kind label.
- `searchJobCategories(q)` in types (re-exported through `lib/listingMeta.ts`) does the label/synonym match for the picker.

## Hidden name (`hide_title`) is NOT searchable
A masked name (job-seeker who ticked "hide my name" → shows "M\*\*\* U\*\*\*") must not be findable by typing the name — otherwise search confirms the person's identity. So the poster's **title/name is kept OUT of `search_blob`/`search_norm`** whenever `hide_title` is set (in both `create()` and `adminUpdate()`; a `searchTitle = hidden ? '' : title` gate). The seeker stays fully findable by **role / skills / category synonyms**, never by name. The name also never appears in the slug (random slug for hidden listings — see below). Fixed 2026-07-05 after "muskan" surfaced a masked seeker; existing hidden rows were reindexed on the box (strip the lowercased title from the blob, recompute `search_norm`).

## Job-seeker marital status (`marital_status`)
Optional dropdown on the job-seeker form (next to Gender): **Single / Married / Divorced / Widowed** (`marital_status`, bilingual labels). Stored on the listing, shown as a row on the seeker's detail page. A profile filter for employers later. Type `MaritalStatus` in `packages/types`; DTO `@IsIn([...])`; schema `marital_status`.

## `hide_number` — a fully-private contact (Happening news/info only)
When set, the number is **collected only for OTP/ownership and never exposed**: `toPublic` forces `has_phone`/`call_ok`/`whatsapp_ok` false and `reveal()` refuses (404 "Contact not available"). In the posting form the flag is **guarded to Happening-only** (`hideNum = postType==='happening' && f.hide_number`), so switching post types can't leak the flag onto a business listing (a real bug that had hidden Bharat Traders' contact — fixed in data + code). See [PRIVACY.md](PRIVACY.md) + [SECURITY.md](SECURITY.md).

## Duplicate-posting warning (on mobile blur)
As the poster types the contact number and tabs out, the form checks for an existing posting with the **same number + same kind** and warns before they create a duplicate. `POST /listings/check-duplicate {mobile, kind, exclude_id?}` (JWT) returns postings the **caller may edit** — their own; **admin → all** — so a number can't be used to enumerate others' listings (no scrape). Grouping is by `kind` (so "Job Seeker" vs "Hiring" are separate; sell/other/business share `kind=business`). On edit, the current listing is excluded via `exclude_id`.
- The frontend (`Post.tsx`, `runDupCheck` on the mobile `onBlur`) only runs when logged-in or admin (else there's nothing to attribute), and skips a number the user already chose to keep (`dupDismissedRef`).
- The modal lists each match (masked title + status). **"View / Edit ↗"** opens that posting in edit view in a **new tab** (`/admin/listings/:id` for admin, `/edit/:id` for users); **"Open all N in edit"** opens one tab per match; **"Continue with new"** dismisses and proceeds. Token: uses the admin token in the admin panel, else the user token (`checkDuplicate(..., preferAdmin)`), since the endpoint accepts either JWT.

## PIN verification + input guards
- Posting form resolves the pincode live → shows "📍 City, State" so the user confirms it.
- Pincode & mobile accept **digits only**; numeric fields (salary, experience) are numeric.

## Search inputs: keywords + "what you deal in" (NOT a forced description)
**Decision (2026-06-22):** do NOT force a long (e.g. 100-word) description — posters are ~50 and want simplicity. Instead, two simple inputs both feed search:
1. **Keywords** (1–3 controlled tags) → category + structured filters.
2. **"What do you sell / deal in?"** (`deals_in`) → one easy free-text box; the poster just types brand/product names in plain words (e.g. *Patanjali, Bikaji, Too Yumm, Snackible, Paperboat, biscuit, namkeen*).

Example: Bharat Traders picks keyword *Grocery/FMCG* and types the brands above → it's now found when anyone searches **any** of those brand terms. Verified end-to-end.

**Relevance ranking:** search runs on a denormalized `search_blob` (title + keywords ×2 + synonyms + deals_in + description). Title & keywords are weighted higher (repetition) so best matches rank first; sorted by Mongo `textScore`. Atlas Search is the future upgrade for fuzzy/typo tolerance.

## Login + metadata
- Posting **requires OTP login**; contact mobile pre-filled; changed numbers need their own OTP (see [AUTH.md](AUTH.md)).
- Every listing stores **audit metadata**: `posted_by_user_id`, `posted_by_mobile` (poster's own number), `source` (web/admin), `approved_by`, `approved_at`, plus timestamps. These are **admin-only — never in public payloads**.

## Listing kinds & fields
Three kinds share one base, then add kind-specific fields. **Most kind-specific fields will become search filters later** — capture them structured, not as free text.

## Base (all kinds)
Mandatory ★: `title`, `mobile`, `pincode`, ≥1 keyword (max 10).
Optional: whatsapp, address, description, photos, hours, alt_phone, email, website, location.
Privacy: `hide_title` (mask as initials + ***), phone always secured (see [PRIVACY.md](PRIVACY.md)).

## Jobs redesigned (2026-06-22) — full info, NO keyword box, auto keywords
Job posts (hiring + seeker) **don't ask for search keywords**. They auto-carry default bilingual job keywords + the role, so generic ("job/naukri/vacancy") AND role ("driver", "cook") searches both work.
- **Hiring** fields: **Business / Organisation name** (this is the `title`, not "Title"), **Job role / position** (`job_role`, required), **Job description** (`description`), **Gender required** (`gender_required`, default `both`), **Working days** (`working_days`), **Timing/shift** (`job_timing`), **Salary min/max**, **Experience required (months)**, **Languages**.
- **Looking for a job** fields: **Your name** (`title`, + hide-name option), **Work you do** (`job_role`, required), **Date of birth** (→ age), **Gender**, **Experience (months)**, **About your experience** (`experience_description`).
- Default keyword sets live in `listings.service.ts` (`JOB_BASE_KEYWORDS` + `JOB_HIRING_KEYWORDS`/`JOB_SEEKER_KEYWORDS`).
- **Privacy:** exact **DOB is never public** — the API returns derived **`age`** only (`toPublic` strips dob). Verified.

## kind = `job_seeker` (candidate posting)
| Field | Type | Filter later? |
|---|---|---|
| `dob` | date → age | ✅ age ranges |
| `gender` | male/female/other | ✅ |
| `experience_months` | number | ✅ ranges |
| `experience_description` | text | search |
| `hide_title` | bool | candidates often hide name |
| keywords | skills/roles | ✅ |

## kind = `job_opening` (business posting a job)
| Field | Type | Filter later? |
|---|---|---|
| `job_timing` | shift / hours | ✅ |
| `off_days` | list of days | ✅ |
| `salary_min` / `salary_max` | number range | ✅ |
| `experience_required_months` | number | ✅ |
| `languages` | list | ✅ |
| `gender` (preference) | optional | ✅ |
| keywords | role/category | ✅ |

## kind = `business` (yellow-pages listing)
Base fields + keywords. Category-style filters come from keywords + `group`.

## Notes
- All these are in the shared `Listing` type today (so the schema is ready); the posting **forms** and **filter UI** are built when we do the listings API.
- Design filters off structured fields (numbers, enums, lists), not parsed text.
