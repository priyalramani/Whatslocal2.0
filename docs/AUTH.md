# Auth & Access

## Two experiences, two device rules
- **User app** (`/`) — **mobile-only**. On wide screens it's centered in a phone-width column (`max-w-[480px]`) so it always reads as a mobile app. **No login required** — the domain home lands straight on the city search. (Login rules for users to be defined later.)
- **Admin** (`/admin`) — **responsive** (mobile + PC). **Login required.**

## Admin login
- Credentials live in the `users` collection (`whatslocal2_0`), role `admin`, password stored as a **bcrypt hash** (never plaintext).
- Seed/reset: `apps/backend/scripts/seed-admin.cjs`
  ```powershell
  # from apps/backend
  $env:ADMIN_USERNAME="admin"; $env:ADMIN_PASSWORD="your-new-pass"; node scripts/seed-admin.cjs
  ```
  Omit `ADMIN_PASSWORD` to auto-generate one (printed once).
- First admin created 2026-06-21: username `admin` (password shown once at creation — change it).

## General-user login (OTP) — real SMS via MSG91 (since 2026-06-24)
- Users sign in with **mobile + OTP**, delivered by **real SMS** through **MSG91's "Login with OTP" widget**, driven **headlessly** (our own `OtpLogin` UI — no MSG91 popup). See memory `whatslocal2-otp-msg91` for the operational details.
- **Flow:** `lib/msg91.ts` loads `verify.msg91.com/otp-provider.js`, `initSendOTP({widgetId, tokenAuth, exposeMethods:true, captchaRenderId})`, then `sendOtp(mobile)` / `verifyOtp(otp)`. On verify, MSG91 returns a signed **access-token (JWT)** which the browser posts to the backend; the backend confirms it with MSG91 and reads the verified number from it.
- **Endpoints:** `POST /auth/otp/widget-verify { accessToken }` → `{ token, user }` (login); `POST /auth/number/widget-verify { accessToken }` → `{ mobile_token }` (verify a different contact number for posting). Both call MSG91 `POST control.msg91.com/api/v5/widget/verifyAccessToken` with `MSG91_AUTH_KEY` and extract the mobile via `pickMobile` (response field or decoded JWT, validated `^[6-9]\d{9}$` so timestamps can't masquerade). **The number is never trusted from the client.**
- **Env-gated, with demo fallback:** web `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_TOKEN_AUTH` (public, baked into the build) and backend `MSG91_AUTH_KEY` (secret). When the widget env is unset, the app uses the **demo path** — `POST /auth/otp/request` (no-op) + `POST /auth/otp/verify {mobile, otp}` comparing to `DEFAULT_OTP` (`1234`) — so local dev works without MSG91.
- **Captcha (anti-OTP-bombing):** hCaptcha renders inline in our login box via `renderCaptcha()` (into `#msg91-captcha-box`); "Send OTP" is gated on `isCaptchaVerified()`. Re-renders per popup mount; `sendOtp` never re-inits (won't reset a solved captcha); when captcha is disabled in MSG91 Widget Settings the box stays empty and the flow proceeds. Owner toggles it on in MSG91.
- **No DLT for SMS:** MSG91 widget → Channels Config → SMS → **"Use Default Configuration"** (shared template route; generic sender, no per-OTP logs). A branded DLT sender is a later nicety. Account KYC must be complete or operators block delivery.
- Upserts a `role:'user'` record keyed by the normalized 10-digit mobile; the JWT carries the mobile.
- **Posting flow (post-time OTP — updated 2026-06-22):** NO upfront login gate. The user fills the whole form first. On **Post**:
  - If already logged in with their **own** number (pre-filled) → submits directly.
  - If **not logged in** → an OTP is sent to the entered contact number; entering it **logs them in as that number** and submits in one step (first-time posters never see a separate login screen).
  - If logged in but using a **different** number → that number is OTP-verified (`/auth/number/verify` → `mobile_token` sent with the listing); the user **stays logged in as their own number**.
  - **Admin is exempt.** Contact mobile is **pre-filled** with the logged-in user's number.
- Two token kinds in the browser: `wl_admin_token` (admin) and `wl_user_token` (general user); `api()` picks by path.

## How it works
- **JWT** (`@nestjs/jwt`), secret in `JWT_SECRET` (`.env`), 7-day expiry.
- `POST /api/v1/auth/login` `{ username, password }` → `{ token, user }`.
- `GET /api/v1/auth/me` → current user (requires bearer).
- Guards (`apps/backend/src/auth/guards.ts`):
  - `JwtAuthGuard` — any valid token.
  - `AdminGuard` — valid token **and** `role === 'admin'`.
- Protected so far: `GET /analytics/summary` (AdminGuard). Public: `POST /events`, search, pin-lookup, `/config`, `/health`.
- Web stores the token in `localStorage` (`wl_admin_token`); `api()` attaches it as `Authorization: Bearer`.

## TODO before prod
- Lock CORS (currently open for dev).
- Rotate `JWT_SECRET` to a strong per-env value.
- Add general-user accounts + the "login required" rules when defined.
- Consider rate-limiting `/auth/login`.
