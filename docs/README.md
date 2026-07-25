# WhatsLocal 2.0 — Documentation

This is the **source of truth** for the project. If you are an AI assistant joining this project, read the documents below in order — by the end you should have most of the context needed without re-exploring the codebase.

> **Project name is centralized.** The brand/project name lives in ONE place: [`brand.config.json`](../brand.config.json) at the repo root (`key` = `whatslocal`, `displayName` = `WhatsLocal`). The domain is **not purchased yet but available** — `domain` is `null` until bought. To rename the project later, change `brand.config.json` only; backend, frontend, docs, and deploy all read from it. Do NOT hardcode the name anywhere else.

> **Status (2026-06-26):** **LIVE at https://whatslocal.in** (RG ERP EC2, pm2 `wl-api` :9100, Atlas `whatslocal2_0`). Full product shipped: search + browse (balanced ranking), posting (7 templates incl. Sell/Rent mode-driven, Happening, Jobs), OTP login (MSG91), gated phone reveal, admin approval + moderation + reports, per-user analytics. Latest batch: **auto-generated WhatsApp share cards (OG, JPEG)** + browse cards + social pre-warm, **listing photo upload** (sharp, EXIF stripped), **`hide_number`** private contact, and a fresh-start production data wipe (listings/reveals/reports cleared; users/tags/config kept). Run instructions in the [root README](../README.md).

## Reading order for a fresh session

| # | Document | What you learn |
|---|---|---|
| 1 | [VISION.md](VISION.md) | What WhatsLocal 2.0 is and why it exists *(pending product explanation)* |
| 2 | [HISTORY.md](HISTORY.md) | How we got here and key context |
| 3 | [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, monorepo layout, runtime services |
| 4 | [DATABASE.md](DATABASE.md) | Mongo cluster/DB, collections inventory, the shared-cluster constraint |
| 5 | [FEATURES.md](FEATURES.md) | Inventory of every feature and its status |
| 6 | [ANALYTICS.md](ANALYTICS.md) | What we capture + the summary endpoint (zero-result searches) |
| 6b | [NOTIFICATIONS.md](NOTIFICATIONS.md) | Push plan — when we ask permission + when/what we notify (EN + Hindi copy). PLANNED, sending not built |
| 7 | [AUTH.md](AUTH.md) | Mobile-only user vs responsive admin; admin login (JWT + bcrypt) |
| 8 | [SECURITY.md](SECURITY.md) | **Hard constraint: data must not leak.** Anti-scrape rules, current posture |
| 8b | [PRIVACY.md](PRIVACY.md) | Phone hidden/secured + number-gating; hide-title masking |
| 9 | [POSTING.md](POSTING.md) | Listing kinds + fields (job-seeker / job-opening / business) |
| 9b | [COMPLAINTS.md](COMPLAINTS.md) | Ward Complaints civic board — design + locked decisions. DESIGNED, not built |
| 10 | [DEPLOYMENT.md](DEPLOYMENT.md) | Hosting plan: single EC2, served on a link |
| 11 | [DECISIONS.md](DECISIONS.md) | Dated log of key decisions and their rationale |

## Living document policy

These files are **not finished** — they grow with every conversation. When the user shares new context, decisions, or corrections, update the relevant file(s) in the same response. Prefer editing existing sections over appending stray notes; the goal is that any single file remains readable end-to-end.

When in doubt about where something belongs:
- A *fact about the past* → HISTORY.md
- A *current technical reality* → ARCHITECTURE.md / DATABASE.md
- A *feature's status* → FEATURES.md
- A *choice we made and why* → DECISIONS.md
