// MSG91 "Login with OTP" widget — headless integration. We keep our own OTP UI
// and just drive the widget's send/verify under the hood. Configured purely via
// build-time env (widgetId + tokenAuth are public, frontend-safe). When unset,
// `msg91Configured` is false and the app falls back to the backend demo OTP.
//
//   VITE_MSG91_WIDGET_ID   — the widget id from MSG91
//   VITE_MSG91_TOKEN_AUTH  — the widget's token auth (public widget token)

const WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID as string | undefined;
const TOKEN_AUTH = import.meta.env.VITE_MSG91_TOKEN_AUTH as string | undefined;

export const msg91Configured = !!(WIDGET_ID && TOKEN_AUTH);

// MSG91 serves the provider from two hosts; fall back to the second if the
// first is blocked/unreachable (mirrors MSG91's own loader snippet).
const SCRIPT_SRCS = [
  'https://verify.msg91.com/otp-provider.js',
  'https://verify.phone91.com/otp-provider.js',
];

// Indian mobile → "91XXXXXXXXXX" (country code, no +), which MSG91 expects.
const withCC = (mobile: string) =>
  '91' + String(mobile || '').replace(/\D/g, '').replace(/^(?:91)?0?(\d{10})$/, '$1');

// The id of the div where MSG91 renders the (h)Captcha. The OTP-entry UI must
// render an element with this id when it wants the captcha to appear.
export const CAPTCHA_ID = 'msg91-captcha-box';

let everInited = false;
let scriptPromise: Promise<void> | null = null;

// Load the provider script once (try each host). Resolves when initSendOTP exists.
function loadScript(): Promise<void> {
  if (!msg91Configured) return Promise.reject(new Error('OTP service not configured'));
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const w = window as any;
    if (typeof w.initSendOTP === 'function') { resolve(); return; }
    const tryAt = (i: number) => {
      if (i >= SCRIPT_SRCS.length) { scriptPromise = null; reject(new Error('Could not load the OTP service.')); return; }
      const s = document.createElement('script');
      s.src = SCRIPT_SRCS[i]; s.async = true;
      s.onload = () => { typeof w.initSendOTP === 'function' ? resolve() : tryAt(i + 1); };
      s.onerror = () => tryAt(i + 1);
      document.head.appendChild(s);
    };
    tryAt(0);
  });
  return scriptPromise;
}

// initSendOTP (re-callable). Passing captchaRenderId makes the widget render the
// captcha (if enabled in widget settings) into #CAPTCHA_ID.
function doInit() {
  (window as any).initSendOTP({
    widgetId: WIDGET_ID,
    tokenAuth: TOKEN_AUTH,
    exposeMethods: true,        // expose window.sendOtp/verifyOtp/retryOtp, no MSG91 popup
    captchaRenderId: CAPTCHA_ID,
    success: () => {},
    failure: () => {},
  });
  everInited = true;
}

// After init the widget exposes sendOtp/verifyOtp/retryOtp a beat later (once it
// fetches its config). Poll until present so callers never hit "is not a function".
function waitForMethods(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const w = window as any;
      if (typeof w.sendOtp === 'function' && typeof w.verifyOtp === 'function') { resolve(); return; }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('OTP service did not start. Check the widget domain whitelist / disable adblock, then retry.'));
        return;
      }
      setTimeout(tick, 60);
    };
    tick();
  });
}

// Render (or RE-render) the captcha into #CAPTCHA_ID — call when the OTP-entry UI
// mounts/re-opens (the div is fresh each time the popup mounts). Returns true if a
// captcha is actually active (i.e. enabled in the widget settings).
export async function renderCaptcha(): Promise<boolean> {
  await loadScript();
  const el = document.getElementById(CAPTCHA_ID);
  if (el) el.innerHTML = '';     // drop any stale captcha iframe before re-init
  doInit();
  await waitForMethods();
  return typeof (window as any).isCaptchaVerified === 'function';
}

// Is the rendered captcha solved? When captcha is disabled the method is absent,
// so we treat it as verified (flow proceeds).
export function isCaptchaVerified(): boolean {
  const f = (window as any).isCaptchaVerified;
  return typeof f === 'function' ? !!f() : true;
}

// Ensure the widget is inited at least once — but DON'T re-init if it already is
// (re-init would reset an already-solved captcha right before we send).
async function ensureReady(): Promise<void> {
  await loadScript();
  if (!everInited) doInit();
  await waitForMethods();
}

const errOf = (e: any) => new Error(e?.message || e?.msg || e?.type || (typeof e === 'string' ? e : 'OTP error'));

// Send an OTP to the given mobile (MSG91 picks the channel per widget config).
export async function sendOtp(mobile: string): Promise<void> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    (window as any).sendOtp(withCC(mobile), () => resolve(), (e: any) => reject(errOf(e)));
  });
}

// Verify the entered OTP. On success MSG91 returns a signed access-token (JWT)
// which we hand to our backend to confirm + read the verified number.
export async function verifyOtp(otp: string): Promise<string> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    (window as any).verifyOtp(
      String(otp),
      (data: any) => resolve(typeof data === 'string' ? data : (data?.message || data?.['access-token'] || '')),
      (e: any) => reject(errOf(e)),
    );
  });
}

// Resend OTP. channel: '11' SMS, '12' WhatsApp, '4' voice, '3' email, null = default.
export async function retryOtp(channel: string | null = null): Promise<void> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    (window as any).retryOtp(channel, () => resolve(), (e: any) => reject(errOf(e)));
  });
}
