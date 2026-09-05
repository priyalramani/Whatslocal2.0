# WhatsApp (WABA) integration

WhatsLocal sends **Meta pre-approved template** messages through the **Fortius
reseller proxy** (same request/response shape as Meta's WhatsApp Cloud API). The
design mirrors the proven Bharat Traders / RG ERP integration: a thin REST
wrapper, config from `process.env`, empty config = disabled.

> **WhatsLocal has its OWN Fortius WABA account** (`whatlocal_fipl`), separate
> from Bharat Traders. Do not reuse BT's number/creds here.

## Config (backend `.env` — never committed)

| Var | Value / note |
|-----|--------------|
| `WABA_BASE_URL` | `https://waba.fortius.in.net/V23.0` |
| `WABA_PHONE_NUMBER_ID` | numeric id of the WhatsLocal WhatsApp number — **in `.env` only** |
| `WABA_AUTH_TOKEN` | Bearer token — **SECRET, in `.env` only** (also recorded in the private session memory `whatslocal2-waba-creds`, never in this repo) |

Empty/absent creds → sends throw a clean *"WhatsApp is not configured"* and the
app still boots. On prod they are set **in place** in the server `.env` (like
`MSG91_AUTH_KEY`), never shipped in the deploy bundle.

## Code

- **Service** — `apps/backend/src/whatsapp/whatsapp.service.ts`
  - `normalizeMobile(v)` — 10-digit / `0…` / `+91…` → `91XXXXXXXXXX`.
  - `sendTemplate({ to, template, languageCode?, bodyParams?, buttonUrlParam?, callbackData? })`
    — builds the Meta payload (a `body` component with N text params + an optional
    `button`/`sub_type:url`/`index:'0'` component) and POSTs to
    `{WABA_BASE_URL}/{WABA_PHONE_NUMBER_ID}/messages` with the Bearer token;
    returns `messages[0].id`.
  - `sendPostApproved(to, postTitle, publishedIn, viewUrl)` — convenience for the
    first template.
- **Routes** — `apps/backend/src/whatsapp/whatsapp.controller.ts`
  - `POST /admin/whatsapp/test` (AdminGuard) — `{ to, template?, language?, bodyParams?[], buttonUrl? }`. The test sender.
- **Module** — `whatsapp.module.ts` (imports AuthModule for AdminGuard; exports
  `WhatsappService` for a future auto-trigger). Registered in `app.module.ts`.
- **Admin UI** — `apps/web/src/admin/AdminWhatsApp.tsx`, route `/admin/whatsapp`,
  nav **Settings → WhatsApp Test**. Fields: recipient, template name, the
  placeholders, a live Hindi preview, **Send test message**.

## Templates

| Template | WABA lang code | Body vars | Button |
|----------|----------------|-----------|--------|
| `post_approved_hindi` | `en` (Hindi body) | `{{1}}` post title · `{{2}}` published-in | dynamic URL `{{url}}` = View-Post link |
| `post_approved_english` | `en` | `{{1}}` post title · `{{2}}` published-in | dynamic URL `{{url}}` |

- HI body: *"आपकी पोस्ट \*{{1}}\* अप्रूव हो गई है और अब \*{{2}}\* में पब्लिश हो गई है। देखने के लिए View Post पर टैप करें।"*
- EN body: *"Your post \"{{1}}\" has been approved and is now published in {{2}}. Tap Visit Post to view it."*

Templates are registered/approved on the Fortius side; the code references only
`name` + parameter order. Both register under WABA language code `en`.

**Parameter limits:** WhatsApp rejects params with newlines / tabs / 4+ spaces and
long values. `clampParam()` sanitises every param; the **post title `{{1}}` is
hard-capped at 40 chars** (append …), published-in at 40.

## Auto-trigger — on listing approval

When an admin **approves** a pending listing (`setStatus` → `approved`, only on the
real pending→approved transition, never on re-approve), `notifyPostApproved()`
fires **fire-and-forget** (a WhatsApp failure never blocks/fails the approval):
- **Recipient** — the submitter's own number (`posted_by_mobile`), falling back to
  the listing's contact `mobile`.
- **{{1}}** masked title · **{{2}}** localized category + city · **{{url}}**
  `{PUBLIC_BASE_URL}/{city}/{slug}`.
- **Language** — the poster's UI language, chosen at posting time: the web sends an
  **`X-Lang`** header (`en`/`hi`, from i18n `wl_lang`) on every request; the create
  controller stores it as `listing.lang`; approval picks `post_approved_hindi` for
  `hi`, else `post_approved_english`. Old rows (no `lang`) → English.

Admin-created posts publish immediately (auto-approved at create) and do **not**
pass through the approve action, so they don't fire this.

## Auto-trigger — "Enough Contact Notification" (interactive)

Per-section threshold **N** set on **Category Setting** (the number cell): once a
post has been contacted by **N distinct people**, the poster gets a WhatsApp with
**Yes / No** — Yes keeps it live, No hides it. Blank / 0 = **None**.

- **Storage** — `app_config 'category_contact_alerts'` = `{ sectionId: count }`,
  same section-id keys as the photo modes (`cat:<key>`, `kind:<kind>`, `sale:<sale|rent>`).
  `GET /listings/categories/contact-alerts` + `PUT /admin/category-contact-alerts`.
- **Milestones** — fires at each multiple of N (N, 2N, 3N…), **one alert pending at
  a time**; distinct count = same signal as the admin "Contacted" column.
- **Detection** — `AnalyticsService.maybeContactAlert()` (called from `record()` on
  every call/whatsapp/copy `contact_click`): resolve N (smallest among the post's
  sections), count distinct, and if the next multiple is reached with no alert
  pending, atomically set `contact_alert_pending` + `contact_alert_milestone` +
  `contact_alert_sent_at` and send.
- **Reply** — quick-reply **Yes/No** comes back via the WABA inbound webhook
  `POST /api/v1/whatsapp/webhook` (public; `GET` does Meta hub-challenge verify,
  optional `WABA_WEBHOOK_VERIFY_TOKEN`). `parseInboundReply()` extracts the choice +
  sender + `context.id`; `ListingsService.handleContactAlertReply()` correlates to
  the post (by our outbound `contact_alert_msg_id`, else by the sender's number among
  pending alerts) → `applyContactAlertReply()`:
  - **Yes** → clear pending, keep live, re-arm for the next multiple; **revive** the
    post only if THIS feature hid it (`contact_alert_hidden`).
  - **No** → hide (`active:false`, `contact_alert_hidden:true`). Reversible by the
    poster from **profile → My posts** (Show).
  - **Flip-flop:** latest tap wins — No-then-Yes revives, Yes-then-No hides.
- **No reply** → auto-hide at **6 h** after the alert (interval sweep in
  `ListingsService`, no scheduler dep) **or** when distinct reaches the next multiple,
  whichever first.
- **Templates (INTEGRATED)** — `enough_contact_hindi` / `enough_contact_english`
  (WABA lang code `en`). Body: **`{{1}}` = count, `{{2}}` = post title**. Two
  **quick-reply** buttons whose payloads must match the template exactly (that
  string returns on tap): HI `हाँ, जारी रखें` / `नहीं, हटाएँ`, EN `Yes, keep active`
  / `No, hide it`. `sendTemplate` builds `sub_type:'quick_reply'` button components.
  The webhook parser matches all four payloads → yes/no (verified).

State fields on the listing: `contact_alert_pending`, `contact_alert_milestone`,
`contact_alert_sent_at`, `contact_alert_hidden`, `contact_alert_msg_id`.

**Still to finalize:** confirm the *real* Fortius inbound-webhook payload shape
against a live sample (the parser is shape-tolerant), and point Fortius's webhook
at `https://whatslocal.in/api/v1/whatsapp/webhook` after deploy — the Yes/No
round-trip can't reach `localhost`.

## Status

- **BUILT (local), not deployed.** Test page, approval auto-trigger, and the
  contact-milestone **detection** all wired; the milestone **template** is pending.
- Deferred (as in BT): delivery-webhook reachability, message history, CC copy,
  multi-template admin editor.
