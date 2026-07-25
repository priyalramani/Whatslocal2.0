# Ward Complaints — design spec

> **Status: BUILT & LIVE (2026-07-05, Phase 1).** A ward-scoped civic complaint board for Gondia: residents post problems, ward members + public discuss, the poster marks resolved. Full loop verified live (add ward → post → approve → comment → moderate → disposition). **Next step for the owner: add the Gondia wards** (Admin → Wards) — until then the section is empty. Phase 2 (push, "Me too", per-ward analytics, auto-archive) not built.

## UX shape (reshaped 2026-07-05)
**Home entry is a real orderable section** — `special:complaints` is in the home-sequence system (`describeSection`/`defaultHomeSequence` + a boot migration that prepends it to saved orders; `homeSections` emits a `{type:'special'}` marker with no listings). It appears in **Admin → Home Order** (tagged "Civic", drag to reposition) and Home renders `WardComplaintsSection` (🏛️ title + "See all ›" + a horizontal row of ward tiles) at whatever position you set — NOT a pinned banner. Posting a complaint is NOT available from the global "+ Post" (that's listings only); you post from inside a ward. "See all" and each tile go to the ward directory / that ward. The directory `/gondia/complaints` lists every ward by **number · name · address** (+ open count). Tapping a ward → its board (`/gondia/complaints/ward/:n`): **ward member(s) contact at the top** (call / WhatsApp / copy buttons — the ONLY place any number is reachable, and only for members), a **Report a problem** button (ward pre-filled), and the ward's complaints as **insta-style cards** (cover photo + title). A complaint opens to a post with a comment thread. **Multiple ward members per ward** (`members[]`); a member is whoever logs in with a listed mobile → their comments auto-approve and are tagged **"Ward Member"**. **No user's mobile is ever shown** — posters/commenters appear by name only; member numbers are behind the contact buttons.

## Implementation (live)
- **Backend** `complaints` module (`apps/backend/src/complaints/`): collections `wards`, `complaints`, `complaint_comments`, `agencies` (agencies auto-seeded: MSEDCL/Police/PWD/MJP/Railways/Revenue/Forest). Endpoints: public `GET /wards|/agencies|/complaints|/complaints/:id`; user (JWT) `POST /complaints`, `/complaints/:id/comments|resolve|dispute|status`, `GET /complaints-mine`; admin `GET|POST /admin/wards`, `/admin/complaints/pending(/count)`, `/admin/complaints/comments/pending`, `/admin/complaints/:id/approve|reject|status`, `/admin/complaints/comments/:cid/approve|reject`.
- **Ward = number + name + address + `members[]`** (multiple `{name, mobile}`). **Ward member = mobile match:** a logged-in user whose mobile matches ANY of the ward's members is the verified member (no separate account-linking) → their comments auto-approve + carry the **"Ward Member"** tag, and they can set dispositions. Admin can do everything. Members' numbers surface only via the call/WhatsApp/copy **contact button** (`MemberContact`), never as listed text.
- **Name:** captured on first complaint/comment (`AuthService.setName` → `users.name`), snapshotted on the complaint, shown publicly; mobile never shown for the poster.
- **Frontend:** user `user/complaints/{ComplaintsHome,ComplaintPost,ComplaintDetail}.tsx` (routes `/:city/complaints[/new|/c/:id]`), a Home entry card, and admin `AdminWards` + `AdminComplaints` (moderation queue) + nav tabs. i18n `cmp.*` (EN + Friendly Hindi).

## Locked decisions (2026-07-05)
1. **Posting requires login (OTP) + a name.** Complaints and comments **display the poster's NAME, never their mobile.** (Contrast: listings only need mobile-OTP, no name. Complaints are the one place we collect + show a name.)
2. **Ward member's mobile is shown openly** (not gated) — it's a civic contact. (Accepted risk: scrapable / spammable.)
3. **Every complaint AND comment is pre-approved by admin** before it goes public. A "be respectful" community-guideline notice + acknowledgment is shown on the post + comment forms.
4. **Ward members get verified accounts + an "Official / Ward Member" badge** (admin links a user account to a ward). **Recommended tweak:** auto-approve ward-member + admin comments (official replies shouldn't wait in the queue; also eases moderation load) — residents' comments still pre-approved.

## Data model (separate module — not listings)
- **`wards`** (admin master): `number`, `area/name`, `member_name`, `member_mobile` (public), `member_user_id` (the verified account), `photo?`, `active`.
- **`complaints`**: `ward_id`, `category` (water / drainage / road-pothole / streetlight / garbage / electricity / stray-animals / encroachment / other), `title`, `description`, `photos[]`, `area`, `poster_user_id`, `poster_name` (snapshot), `status`, `created/updated`, `resolved_at`, `resolved_by`.
- **`complaint_comments`** (NEW subsystem — the app has no comments elsewhere): `complaint_id`, `author_user_id`, `author_name`, `author_role` (public / ward_member / admin), `text`, `status` (pending / approved / hidden), `created`.

## Roles & permissions
- **Resident** (logged-in + named): post complaint, comment, mark **own** complaint resolved, reopen.
- **Ward member** (verified account): comments carry the **Official badge**; can set **In progress**; comments auto-approved (recommended).
- **Admin**: approve/reject complaints + comments, manage wards, override status, ban abusers.
- **Public** (not logged in): read approved content; must log in + give a name to post/comment.

## Lifecycle + dispositions (not every complaint can be "resolved")
Many real complaints legitimately can't be resolved by that ward member (wrong dept, wrong ward, needs budget, seasonal, etc.). So the status is **two layers**: a **stage** (Open → Acknowledged/In-progress → Terminal) and a **disposition** (the terminal outcome). The **top ~100 Gondia complaints' "can't-do" reasons collapse into ~11 dispositions**, each requiring a **mandatory public reason** so nothing is closed silently.

| Reason bucket | Disposition | Extra field |
|---|---|---|
| Not municipal — other agency (power, police, PWD, MJP, railway, revenue) | **Forwarded → {agency}** (keeps tracking) | agency (from the directory + helpline) |
| Wrong ward / location | **Reassigned → Ward X** | new ward (notifies its member) |
| Needs budget / sanction / tender | **Approved — pending funds** | expected phase/quarter |
| Seasonal / dependency (after monsoon, after pipeline) | **On hold — pending {condition}** | condition + expected date (+ auto-nudge) |
| Needs higher authority (scheme, MLA/MP fund) | **Escalated → {authority}** | note |
| Land / legal dispute | **Under legal process** | note |
| Duplicate | **Duplicate → #id** | merges, moves the "Me too" count |
| Vague / no location / no photo | **Need more info** | bounces to poster to edit |
| Inspected — no issue / false / personal dispute | **Rejected — {reason}** | public reason (+ poster can dispute) |
| Will do, queued | **Scheduled — {date}** | date + reminder |
| Done | **Resolved** | poster confirms (only the poster) |

**Rules:**
- **Every non-resolved disposition requires a public reason** typed by the ward member/admin (protects the member *and* informs the citizen). `Forwarded`/`On hold` keep tracking — not silent closures.
- **Only the poster sets `Resolved`.** Ward member sets "Work done — awaiting confirmation"; poster confirms or **disputes** ("Still an issue") → reopens / admin review. The dispute button is the guard against dodging via "not my department".
- **External-agency directory** (MSEDCL / Police / PWD / MJP / Railways / Revenue + helplines) powers `Forwarded` → auto-shows the citizen where to actually go.
- **`On hold`/`Scheduled` carry an expected date** + auto-nudge so complaints don't live forever.
- The **"posted N days ago · no response yet"** timeline is the civic-pressure value — and the political risk that makes moderation essential.

## Governance / anti-dodge
- Mandatory public reason on every close/forward (above) + the dispute button.
- **Per-ward disposition analytics** (admin): resolved % vs forwarded % vs rejected % vs open + avg response time — a member forwarding 70% is visible.
- Optional public **ward scorecard** (X% resolved, Y open, avg N days) — the strongest transparency hook of the feature.
- New master: **`agencies`** (external departments + helpline) for the Forwarded disposition.

## Name capture — login-first, name-once (revised 2026-07-06)
Posting anywhere in this section (new complaint **or** comment) is gated by a single reusable `NameLoginGate.tsx`: **(1) OTP login, then (2) a one-time display-name prompt** if the account has no `users.name` yet. Once set, the name is reused everywhere and **never asked again** — the old per-post name field is gone, so a user can't post under different names each time. Stored on `users.name`; shown on complaints + comments **in this section only** (everywhere else stays mobile-OTP, no name).
- Backend: `GET /auth/me` now returns the DB `name` (the JWT doesn't carry it); `POST /auth/me/name { name }` sets it (min 2 chars, ≤60). `complaints.service.resolveName` still falls back to the stored name.
- Frontend: `getMyProfile()` / `setMyName()` in `lib/userAuth`. `ComplaintPost` gates on **entry** (cancel → back to the ward list) and re-gates + auto-resubmits if the token goes stale. `CommentsSheet` + `ComplaintDetail` gate on **send** (then post). Poster/admin actions (resolve/dispute) still use a plain OTP re-login (no name needed).

## Moderation (heavy by design — decision #3)
- Admin **Complaints** queue (like Approvals) for complaints + resident comments.
- **Community-guideline notice + "I'll be respectful" acknowledgment** on the post + comment forms (bilingual). No abuse, no false claims, no disrespectful naming of individuals.
- Report button on complaints + comments (reuse the existing reports/moderation + blocked-users).
- Load-relief as volume grows: auto-approve ward-member/admin comments (above); later, auto-approve trusted repeat posters.

## Home / navigation
New home section **"Ward Complaints / वार्ड शिकायत"** → ward list (member name + open number + open-complaint count) → a ward's complaints → complaint detail with photos + comment thread. City-scoped like everything else.

## Reuse vs new
- **Reuse:** OTP login, photo upload (sharp/EXIF-stripped), reports/moderation, admin panel, home-section framework, city scoping, and **push** (perfect fit — notify: complaint approved, ward member replied, new comment, marked resolved; and ward member ← new complaint in your ward).
- **New:** the comments subsystem, the `wards` master, the complaint lifecycle, and the verified-ward-member concept.

## Consequences accepted (so we don't relitigate later)
- **Public real names** on complaints — accountability, but exposes the complainant.
- **Open ward-member numbers** — scrape/spam risk.
- **Pre-approving every comment** — real-time admin load; mitigated by auto-approving official (member/admin) comments.

## Phased build (when approved)
- **Phase 1:** `wards` master (admin) + complaint post (login + name + ward + category + photos) + **pre-approval queue** + ward-wise browse + comments (pre-approved) + poster-marks-resolved + verified-member badge + report/moderate + the respectful-use notice.
- **Phase 2:** push notifications, a **"Me too" count** (how many share the problem), per-ward analytics (avg resolution time — public accountability), auto-archive stale complaints, richer ward-member "in progress" workflow.

## Ward board = Instagram-style feed (built 2026-07-06)
The ward page (`/:city/complaints/ward/:n`) is a familiar social feed, not a list:
- Post = avatar + poster name + category/time/area, then large media (single or a **snap carousel** with dots + `1/N` counter), then an **action row: ✋ Me too / 💬 Comment / ✈ Share**, then the me-too count, caption (name + title + description) and a "View all N comments" link. **Text-only** posts (no photo) render Facebook-style — big title + body, no media block.
- **Newest first; infinite scroll** (IntersectionObserver sentinel loads older pages).
- **✋ "Me too" = the "I'm affected too" count** (the Phase-2 idea, shipped early — semantically right for civic issues; a heart/"like" on a pothole reads wrong). Outline icon that **fills amber on tap** (Instagram-heart interaction). Count reads "N also affected". Stored as `complaints.likes: string[]` (user ids); `POST /complaints/:id/like` toggles (login-gated → OTP popup; optimistic UI). `list`/`detail` return `like_count`, `liked`, `comment_count` (approved only).
- **💬 Comment** opens a **bottom-sheet drawer** (`CommentsSheet.tsx`, ~70vh, slide-up) with the thread + composer + emoji quick-row + login gate — Instagram-style, no page navigation. "View all N comments" opens the same drawer. Tapping the media/caption still opens the full detail page.
- **✈ Share** uses the Web Share API → clipboard fallback with the post's public URL.

## District structure — bodies, talukas, wards (built 2026-07-06)
Gondia is a **district** with 8 talukas; each has a **town** (municipal body, wards + councillor) and many **villages** (gram panchayats, wards + Sarpanch/Panch). ~83% rural.
- **`bodies` collection**: `{ name, type: municipal|gram_panchayat, taluka, city, pincodes[] }`. Seeded with the 8 taluka towns (Gondia pincodes `[441601, 441614]` — the town spans both; others blank for the admin to fill).
- **Ward** now carries `body` + `taluka` + `body_type`; **unique by (city, body, number)** — Gondia ward 1 ≠ Tirora ward 1. **Complaints** carry `body`/`taluka` too. Legacy Gondia rows are backfilled to `body:"Gondia"` on boot (additive, non-destructive).
- **Routing**: ward feed is by **ward `_id`** (`/:city/complaints/ward/:wardId`) since numbers repeat; complaints list is scoped by `(body, number)`. `ward-member` check + comment/disposition auth are all `(body, number)`-aware.
- **Resident**: ComplaintsHome groups wards by town/taluka; ComplaintPost has a Town selector (shown when >1 town) that scopes the ward list and sends `body`.
- **Admin**: Wards page has a **Town/body selector** (from `GET /bodies`); `POST /admin/bodies` manages bodies (pincode editing UI is a TODO — bodies are seeded so wards can be added now). `GET /bodies/by-pincode/:pin` exists for future pincode→town resident routing.
- **Rollout**: 8 towns first (seeded); gram panchayats (556) added later, taluka by taluka.

## Dispositions simplified to 3 (built 2026-07-06)
The ward-member / admin panel is now **In progress · Can't take up · Mark done** (was 9 options):
- **In progress** → `in_progress` (reason optional).
- **Can't take up** → `closed` (public reason **required**).
- **Mark done** → `resolved`; the **poster verifies** — they get a **"Not resolved — reopen"** button that reopens either a `resolved` or `closed` complaint (`can_reopen`). Poster/admin can also mark done directly (`can_resolve`).
Forwarded/agency + on-hold/scheduled/date machinery retired from the UI (the nuance goes in the required reason). `SetStatusDto` now validates against `in_progress|closed|resolved|open|rejected`.
