// PWA "Install / Add to Home Screen" soft-ask. Mirrors the notification opt-in
// discipline in push.ts: NEVER cold-prompt — we capture the browser's
// `beforeinstallprompt`, show OUR OWN card first, and fire the native prompt only
// on "Install", inside that same tap. iOS Safari has NO programmatic install, so
// there the card shows manual "Share → Add to Home Screen" steps instead.
//
// TRIGGER + CAPS (agreed): show only to a RETURNING visitor (2nd+ session), the
// first time they tap a contact that session (call/WhatsApp/copy) — the app just
// delivered — ~1.5s after, and only if no other soft-card already showed this
// session (install has the lowest priority; see softAsk.ts). Caps: at most 3
// asks, 7-day cooldown, once/session, and it stops forever on install.
import { trackPopup } from './analytics';
import { softAskClaimed } from './softAsk';

const KEY = 'wl_install';
interface InstallState { installed?: boolean; dismissed?: number; lastAskAt?: number }
const read = (): InstallState => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (s: InstallState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

const MAX_ASKS = 3;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;   // a week between asks — install is a heavier ask than push
const MIN_SESSION = 2;                         // returning visitors only (never first visit)

// Sessions this device has opened, counted once per browser session. Drives the
// "returning visitor" gate. sessionStorage sentinel = "already counted this tab".
function sessionCount(): number {
  try { return parseInt(localStorage.getItem('wl_sessions') || '0', 10) || 0; } catch { return 0; }
}
function bumpSession(): void {
  try {
    if (sessionStorage.getItem('wl_sess_counted')) return;
    sessionStorage.setItem('wl_sess_counted', '1');
    localStorage.setItem('wl_sessions', String(sessionCount() + 1));
  } catch { /* ignore */ }
}

// The stashed BeforeInstallPromptEvent (Android/Chromium only). Captured by
// initInstall() before React mounts, so we never miss it.
let deferred: any = null;

// Launched as an installed app already? Then there's nothing to offer.
export function isStandalone(): boolean {
  return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || (typeof navigator !== 'undefined' && (navigator as any).standalone === true);
}
function isIos(): boolean { return /iPad|iPhone|iPod/.test(navigator.userAgent || ''); }
// iOS install only exists in Safari (Chrome/Firefox/Edge iOS can't add to home).
export function isIosSafari(): boolean {
  const ua = navigator.userAgent || '';
  return isIos() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
// The card can only do something useful if we have a native prompt (Android) OR
// we're on iOS Safari (manual steps). Otherwise stay silent.
export function installSupported(): boolean {
  return !!deferred || isIosSafari();
}
// Which flavour of card to render: iOS = manual instructions, else = native button.
export function isIosInstall(): boolean { return !deferred && isIosSafari(); }

// Register the browser hooks ONCE, as early as possible (main.tsx), so an early
// beforeinstallprompt is captured and an install is remembered forever.
let inited = false;
export function initInstall(): void {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  bumpSession();   // count this visit for the "returning visitor" gate
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; write({ ...read(), installed: true }); });
}

// Show OUR card now? Only when it can succeed and we're not nagging.
export function canAskInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) return false;          // already installed / running as app
  if (!installSupported()) return false;     // no native prompt and not iOS Safari
  if (sessionCount() < MIN_SESSION) return false;  // returning visitors only
  if (softAskClaimed()) return false;        // another soft-card already showed this session — yield
  const s = read();
  if (s.installed) return false;
  if ((s.dismissed || 0) >= MAX_ASKS) return false;
  if (s.lastAskAt && Date.now() - s.lastAskAt < COOLDOWN_MS) return false;
  return true;
}
export function noteAsked() { write({ ...read(), lastAskAt: Date.now() }); }
export function noteDismissed() { const s = read(); write({ ...s, dismissed: (s.dismissed || 0) + 1, lastAskAt: Date.now() }); }

// Fire the native Android/Chromium prompt — MUST be inside a user gesture, and
// the event is single-use, so we drop it after. Returns the outcome.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const e = deferred; deferred = null;
  try {
    e.prompt();
    const choice = await e.userChoice;
    if (choice?.outcome === 'accepted') { write({ ...read(), installed: true }); trackPopup('install', 'accepted'); return 'accepted'; }
    noteDismissed(); trackPopup('install', 'dismissed'); return 'dismissed';
  } catch { return 'unavailable'; }
}

// ---- soft-ask trigger bus: a trigger calls maybeAskInstall(); InstallHost renders.
// Reason is free-form for now (the actual trigger points are pending).
type Reason = string;
let showFn: ((r: Reason) => void) | null = null;
export function _setInstallShow(fn: ((r: Reason) => void) | null) { showFn = fn; }
export function maybeAskInstall(reason: Reason) {
  if (typeof location !== 'undefined' && location.pathname.startsWith('/admin')) return; // never in admin
  if (!canAskInstall() || !showFn) return;
  showFn(reason);
}

// The value-moment trigger: schedule ONE deferred ask this session (so multiple
// contact taps don't stack timers), a beat after the action so the card doesn't
// land on top of it. canAskInstall() still decides whether it actually shows.
let scheduled = false;
export function maybeAskInstallSoon(reason: Reason, delayMs = 1500) {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => maybeAskInstall(reason), delayMs);
}
