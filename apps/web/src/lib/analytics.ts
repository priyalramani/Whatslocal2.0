// Browser analytics client — captures everything we need to iterate fast:
// visits, sessions, devices (parsed server-side from UA), search queries
// (including zero-result), contact clicks, featured-tile taps, etc.
import type { AnalyticsEventType, AnalyticsEventInput } from '@whatslocal/types';
import { api } from './api';

const VISITOR_KEY = 'wl_visitor_id';
const SESSION_KEY = 'wl_session_id';

function uid(): string {
  // Random enough for an anonymous id; not security-sensitive.
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) { id = uid(); localStorage.setItem(VISITOR_KEY, id); }
  return id;
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) { id = uid(); sessionStorage.setItem(SESSION_KEY, id); }
  return id;
}

// Lightweight ambient context the app can set (e.g. selected city/pincode).
const ctx: { city: string | null; pincode: string | null } = { city: null, pincode: null };
export function setAnalyticsContext(next: Partial<typeof ctx>) {
  Object.assign(ctx, next);
}

// Read identity/language straight from localStorage (no import cycle with
// userAuth/i18n). Every event then carries who + what language, so once a
// visitor logs in their future events are already attributed, and `identify`
// backfills the earlier anonymous ones.
function currentUserId(): string | null {
  try { const s = localStorage.getItem('wl_user_session'); return s ? (JSON.parse(s).id ?? null) : null; }
  catch { return null; }
}
function currentLang(): string | null {
  const v = localStorage.getItem('wl_lang');
  return v === 'en' || v === 'hi' ? v : null;
}

export function track(
  type: AnalyticsEventType,
  extra: Partial<AnalyticsEventInput> = {},
): void {
  try {
    const payload: AnalyticsEventInput = {
      type,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      user_id: currentUserId(),
      lang: currentLang(),
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      city: ctx.city,
      pincode: ctx.pincode,
      ...extra,
    };
    const body = JSON.stringify(payload);
    // sendBeacon survives page unload; fall back to fetch keepalive.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/v1/events', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch {
    // Never let analytics break the app.
  }
}

// Call once, right after a successful OTP login: hand the server this device's
// visitor id so it can backfill every earlier anonymous event with the user_id.
// Fire-and-forget — a failure just means the admin sees the pre-login history as
// anonymous, which is harmless. Uses the user token (set by login) via api().
export async function identify(): Promise<void> {
  try {
    await api('/events/identify', {
      method: 'POST',
      body: JSON.stringify({ visitor_id: getVisitorId() }),
    });
  } catch {
    // Never let identity-linking break the login flow.
  }
}

export const trackPageView = () => track('page_view');
export const trackSearch = (query: string, result_count: number) => {
  track('search', { query, result_count });
  if (result_count === 0) {
    track('search_zero_results', { query, result_count: 0 });
    // Remember the last unmet demand so the Services post-prompt can invite
    // whoever offers it ("Are you a {query}? List your service").
    try { localStorage.setItem('wl_last_zero_search', JSON.stringify({ q: query, ts: Date.now() })); } catch { /* ignore */ }
  }
};
export const trackFeaturedClick = (target: string) => track('featured_click', { target });
