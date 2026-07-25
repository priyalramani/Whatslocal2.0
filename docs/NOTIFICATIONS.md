# Push Notifications — plan & message catalog

> **Status: OPT-IN CAPTURE LIVE (deployed 2026-07-05); SENDING + ADMIN not built.** The user-facing subscription flow — service worker, VAPID, soft-ask card on 2 triggers, `push_subscriptions` capture — is **live on whatslocal.in** and now accumulating subscribers. What's still to build: the **send** side (`web-push` library + `POST /admin/push/send`) and the **admin panel** (owner said "in a few days"), plus the automated personalized triggers. This file is the source of truth for **when** we notify and **what** the message says (English + Friendly Hindi).

## What's built (opt-in capture — Phase 1a)
- **Backend `PushModule`** (`apps/backend/src/push/`): `push_subscriptions` collection (endpoint-keyed; visitor_id + user_id + city + ua); `GET /push/vapid-key`, `POST /push/subscribe` (anon-ok; user_id from optional bearer, UA from header), `POST /push/unsubscribe`, `POST /push/link` (attach a visitor's subs to the user on login).
- **VAPID keys:** self-generated (Node `crypto`, P-256 — not from any provider). Public key is a non-secret constant/env fallback in `push.service.ts` (also `VAPID_PUBLIC_KEY`). **Private key is NOT committed** — the pair is recorded in the git-ignored [`docs/SECRETS.local.md`](SECRETS.local.md); the private key goes in the box `.env` as `VAPID_PRIVATE_KEY` when the send side is built. Once prod has subscribers, the public key must stay stable.
- **Frontend:** `public/sw.js` (push display + click→open url), `lib/push.ts` (guards, `subscribePush`, `linkPushUser`, `maybeAskPush` trigger bus), `user/PushHost.tsx` (the soft-ask card). Card fires on **after-post** (`Post.tsx`) and **zero-result search** (`Home.tsx`); guarded to Android/Chrome, `permission==='default'`, not-iOS-tab, not-admin, with cooldown (3 days) + cap (3 asks). Login links the sub to the user (`userAuth.ts`).
- **Card buttons (live copy):** "Yes, notify me" / "Not now" + helper "Tap Allow on the next screen" — i18n `push.*`.

Android first (audience skews Android). iOS deferred — needs Add-to-Home-Screen (PWA) on iOS 16.4+, low conversion. Standard Web Push (VAPID) — **no platform fees, no Apple developer account**.

## Golden rule — never cold-ask
The real browser prompt is one-shot: an explicit "Block" is permanent and can't be re-triggered programmatically. So we **always show our own in-app soft-ask card first**, and fire the real prompt **only** if the user taps Allow. A "Not now" on our card costs nothing → re-ask later (cooldown). Only ask when `Notification.permission === 'default'` on Android/Chrome; skip `granted`/`denied`.

## A. Permission soft-ask — WHEN to ask + card copy
Shown at a high-intent moment (never on first load, never stacked with the login gate). Cooldown: dismissed → next session / a few days, cap ~2–3 lifetime.

| When (trigger) | Title (EN / HI) | Body (EN / HI) |
|---|---|---|
| **Right after a successful post** *(best moment)* | Get replies instantly / जवाब तुरंत पाएं | We'll message you the moment someone calls or WhatsApps about your post. / जैसे ही कोई आपकी पोस्ट पर कॉल या WhatsApp करे, हम आपको मैसेज करेंगे। |
| **Zero-result search** | Nothing found — want an alert? / कुछ नहीं मिला — अलर्ट चाहिए? | We'll notify you when a "{query}" is posted in Gondia. / जब "{query}" गोंदिया में पोस्ट होगी, हम बता देंगे। |
| **Just contacted a listing** (call/WhatsApp) | Stay updated / अपडेट रहें | Get a ping if they reply, or when similar posts come up. / अगर वो जवाब दें या ऐसी और पोस्ट आए तो हम बता देंगे। |
| **Just logged in / registered** | Turn on alerts / अलर्ट चालू करें | Replies, matching jobs and new items — free, no spam. / जवाब, मैचिंग जॉब और नया सामान — फ्री, कोई स्पैम नहीं। |

**Buttons** — sell the benefit, keep dismiss soft (never "Block/No", so re-asking stays OK):
- **Accept:** "Yes, notify me" / "हाँ, मुझे बताएं" (context variants: "Notify me" after a post, "Alert me" on a zero-result search). This tap fires the real browser prompt.
- **Dismiss:** "Not now" / "अभी नहीं".
- **Helper line** (for less-literate users, since the browser's own Allow/Block popup follows and we can't restyle it): "Tap **Allow** on the next screen" / "अगली स्क्रीन पर **Allow** दबाएं".

## B. Notification catalog — WHEN each fires + the message
Placeholders: `{title}`, `{role}`, `{query}`, `{n}`, `{city}`. Every notification deep-links (click → opens that page in the app).

### 1. To the POSTER — transactional, highest value (always allowed)
| # | Trigger (WHEN) | Title (EN / HI) | Body (EN / HI) | Opens |
|---|---|---|---|---|
| a | Someone does a real contact action (**call / WhatsApp / copy**) on your listing | Someone contacted your post 📞 / किसी ने आपकी पोस्ट पर कॉन्टैक्ट किया 📞 | A person just took the number on "{title}". Reply fast — they're interested! / अभी किसी ने "{title}" का नंबर लिया — जल्दी जवाब दें! | the listing |
| b | Your post is **approved / goes live** | Your post is live ✅ / आपकी पोस्ट लाइव है ✅ | "{title}" is now visible to everyone in Gondia. / "{title}" अब गोंदिया में सबको दिख रही है। | the listing |
| c | Your listing crosses a **views milestone** (e.g. 25/day) *(P2, optional)* | Your post is trending 🔥 / आपकी पोस्ट पॉपुलर हो रही है 🔥 | "{title}" got {n} views today. / "{title}" को आज {n} बार देखा गया। | the listing |
| d | **"Still available?"** nudge (ties to the availability/expiry idea) *(P2)* | Is "{title}" still available? / "{title}" अभी भी उपलब्ध है? | Tap to keep it live, or mark it done so we stop showing it. / लाइव रखने के लिए टैप करें, या "हो गया" मार्क करें। | the listing |

### 2. To JOB SEEKERS
| # | Trigger | Title | Body | Opens |
|---|---|---|---|---|
| e | A new **job opening** matches their role/interest (posted a seeker profile, or browsed that role) | New {role} job in Gondia 💼 / गोंदिया में नई {role} जॉब 💼 | An employer is hiring a {role}. Tap to view & contact. / एक एम्प्लॉयर {role} ढूंढ रहा है। देखें और कॉन्टैक्ट करें। | that opening |

### 3. To EMPLOYERS (hiring)
| # | Trigger | Title | Body | Opens |
|---|---|---|---|---|
| f | A new **job seeker** matches your opening's role | New {role} looking for work 🙋 / नया {role} काम ढूंढ रहा है 🙋 | A {role} just posted their profile in Gondia. / गोंदिया में एक {role} ने अभी प्रोफाइल पोस्ट की। | that seeker |

### 4. To BUYERS / BROWSERS (sell / rent)
| # | Trigger | Title | Body | Opens |
|---|---|---|---|---|
| g | New **sell/rent** item in a category the user searched/browsed | New {category} in Gondia 🏷️ / गोंदिया में नई {category} 🏷️ | Just posted — tap to see. / अभी पोस्ट हुई — देखें। | that listing |
| h | A past **zero-result search** is now fulfilled (they searched X, later X is posted) | "{query}" is now available 🎉 / "{query}" अब उपलब्ध है 🎉 | You searched for {query} earlier — someone just posted one. / आपने {query} ढूंढा था — अभी किसी ने पोस्ट किया। | that listing |

### 5. GENERAL / broadcast (admin-sent, low frequency)
| # | Trigger | Title | Body | Opens |
|---|---|---|---|---|
| i | **Daily digest** — once each morning if there's fresh content | Today in Gondia 📢 / आज गोंदिया में 📢 | {n} new jobs, {m} items & more posted today. Tap to browse. / आज {n} नई जॉब, {m} सामान और भी पोस्ट हुए। देखें। | home |
| j | **Re-engagement** — subscribed but not opened in ~7 days | New listings since you left 👋 / आपके जाने के बाद नई लिस्टिंग 👋 | Fresh jobs and items in Gondia are waiting. / गोंदिया में नई जॉब और सामान इंतज़ार में हैं। | home |

## C. Frequency & anti-spam rules (protect the opt-in)
- **Transactional** (a, b) — always sent; never blocked by caps. Burst → **batch** ("{n} people contacted '{title}' today").
- **Interest-based** (e, f, g, h) — max **1/day per user**, batched ("3 new Cook jobs today").
- **Broadcast/digest** (i) — max **1/day**.
- **Re-engagement** (j) — max **1/week**.
- **Global cap:** ≤ **2 non-transactional** notifications/day/user.
- **Quiet hours:** nothing 10pm–7am — hold for the morning batch.
- Keep bodies ≤ ~120 chars; one clear action; deep-link always.

## D. Phasing
- **Phase 1 (scoped, not built):** service worker + VAPID + `push_subscriptions` collection + `POST /push/subscribe` + soft-ask card on **(after-post)** and **(zero-result search)** + **admin broadcast** panel (powers the digest *i* + manual sends). Subscriptions stored per `visitor_id`, linked to `user_id` on login.
- **Phase 2:** the automated personalized triggers (a, e, f, g, h) using existing analytics/interest data + poster→subscription mapping; the trending/expiry nudges (c, d); iOS Add-to-Home-Screen funnel.

## E. Signals we already have (so Phase 2 is cheap)
`post_submit`, `contact_click` (+ listing_id + target), `search_zero_results` (+ query), sessions/time, per-visitor interest (the points model), and the `identify` backfill — all already logged. Poster is `posted_by_user_id`; targeting by interest/city/income tier reuses existing data.
