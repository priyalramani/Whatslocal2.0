// Web Push opt-in (Android/Chrome). Captures subscriptions now; sending is built
// later. The golden rule: NEVER cold-ask — we show our own soft-ask card first
// (PushHost) and only fire the real browser prompt (`subscribePush`) on "Yes".
import { getVisitorId } from './analytics';
import { getUserToken } from './api';

const KEY = 'wl_push';
interface PushState { subscribed?: boolean; dismissed?: number; lastAskAt?: number }
const read = (): PushState => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (s: PushState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

const MAX_ASKS = 3;                              // give up after this many dismissals
// Wait a day between asks: long enough to never nag in the same session/day,
// short enough to re-offer a returning, interested visitor. Our own card is
// harmless to dismiss (unlike the browser's permanent Block), so re-asking on a
// later visit is fine — just never twice in one session.
const COOLDOWN_MS = 1 * 24 * 60 * 60 * 1000;

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

// iOS Safari tab can't do web push at all (needs the site added to Home Screen);
// we defer iOS, so never show the card there.
function isIosSafariTab(): boolean {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || (navigator as any).standalone === true;
  return iOS && !standalone;
}

// Should we show OUR soft-ask card right now? Only when it can actually succeed
// and we're not nagging: permission still 'default' (granted → done, denied →
// futile), not already subscribed, under the cap, past the cooldown.
export function canAskPush(): boolean {
  if (!pushSupported() || isIosSafariTab()) return false;
  if (Notification.permission !== 'default') return false;
  const s = read();
  if (s.subscribed) return false;
  if ((s.dismissed || 0) >= MAX_ASKS) return false;
  if (s.lastAskAt && Date.now() - s.lastAskAt < COOLDOWN_MS) return false;
  return true;
}
export function noteAsked() { write({ ...read(), lastAskAt: Date.now() }); }
export function noteDismissed() { const s = read(); write({ ...s, dismissed: (s.dismissed || 0) + 1, lastAskAt: Date.now() }); }

function urlB64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Register the SW, fire the REAL browser prompt (must be inside a user gesture),
// subscribe, and POST the subscription to the backend. Returns true if subscribed.
export async function subscribePush(city?: string | null): Promise<boolean> {
  try {
    if (!pushSupported()) return false;
    // Ask permission FIRST, while the click's user-activation is still fresh.
    // Awaiting the SW registration before this consumes the gesture, so Chrome
    // silently skips the prompt (the bug where "Yes" did nothing).
    const perm = await Notification.requestPermission();   // the browser's own Allow/Block
    if (perm !== 'granted') { noteDismissed(); return false; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const vapid = await fetch('/api/v1/push/vapid-key').then((r) => r.json()).then((j) => j?.key).catch(() => null);
    if (!vapid) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapid) });
    const token = getUserToken();
    await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ subscription: sub.toJSON(), visitor_id: getVisitorId(), city: city || null }),
    });
    write({ ...read(), subscribed: true });
    return true;
  } catch { return false; }
}

// After login: attach this device's subscription to the now-known user.
export async function linkPushUser(): Promise<void> {
  try {
    if (!read().subscribed) return;
    const token = getUserToken(); if (!token) return;
    await fetch('/api/v1/push/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ visitor_id: getVisitorId() }),
    });
  } catch { /* ignore */ }
}

// ---- soft-ask trigger bus: pages call maybeAskPush(); PushHost renders the card.
type Reason = 'post' | 'search';
let showFn: ((r: Reason) => void) | null = null;
export function _setPushShow(fn: ((r: Reason) => void) | null) { showFn = fn; }
export function maybeAskPush(reason: Reason) {
  if (typeof location !== 'undefined' && location.pathname.startsWith('/admin')) return; // not in admin
  if (!canAskPush() || !showFn) return;
  showFn(reason);
}
