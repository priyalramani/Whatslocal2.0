import type { PublicListing, Tag } from '@whatslocal/types';
import { api, getUserToken, getAdminToken } from './api';
import { getVisitorId } from './analytics';

export interface SearchResponse {
  page: number; page_size: number; total: number; results: PublicListing[];
  // Present only when the typed query found nothing and a spelling correction
  // did: `corrected` is what we actually searched, `original` what was typed.
  corrected?: string;
  original?: string;
}

// ---- public ----
export const searchListings = (q: string, city?: string, kind?: string, page = 1, filters?: Record<string, any>) => {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (city) p.set('city', city);
  if (kind) p.set('kind', kind);
  p.set('page', String(page));
  // Device id → fair-visibility rotation (stable first row per visitor per day).
  try { p.set('vid', getVisitorId()); } catch { /* storage disabled */ }
  if (filters) for (const [k, v] of Object.entries(filters)) if (v != null && v !== '') p.set(k, String(v));
  return api<SearchResponse>(`/listings/search?${p.toString()}`);
};

export const getListing = (id: string) => api<PublicListing>(`/listings/${id}`);

// ---- home feeds + personalization signals ----
export const getOffers = (city?: string, category?: string) => {
  const p = new URLSearchParams();
  if (city) p.set('city', city);
  if (category) p.set('category', category);
  return api<{ results: PublicListing[] }>(`/listings/offers${p.toString() ? `?${p}` : ''}`);
};
// "New in {city}" — curated fresh digest. `vertical` softly floats the visitor's
// top interest (server does dedupe / freshness / round-robin regardless).
export const getRecent = (city?: string, vertical?: string) => {
  const p = new URLSearchParams();
  if (city) p.set('city', city);
  if (vertical) p.set('v', vertical);
  return api<{ results: PublicListing[] }>(`/listings/new${p.toString() ? `?${p}` : ''}`);
};
export const getVerticalCounts = (city?: string) =>
  api<Record<string, number>>(`/listings/vertical-counts${city ? `?city=${encodeURIComponent(city)}` : ''}`);
// Real categories present in a bucket (data-driven category rail).
export const getCategoryBreakdown = (city?: string, kind?: string, postType?: string, saleOrRent?: string, excludeSell?: boolean) => {
  const p = new URLSearchParams();
  if (city) p.set('city', city);
  if (kind) p.set('kind', kind);
  if (postType) p.set('post_type', postType);
  if (saleOrRent) p.set('sale_or_rent', saleOrRent);
  if (excludeSell) p.set('no_sell', '1');
  return api<{ results: { key: string; count: number }[] }>(`/listings/categories?${p}`);
};
// "Trending this week" — listings ranked by real contact-demand (last 7 days).
export const getTrending = (city?: string) =>
  api<{ results: PublicListing[] }>(`/stats/trending${city ? `?city=${encodeURIComponent(city)}` : ''}`);
// v2 personalization: server-computed vertical affinity for this visitor/user.
export const getAffinity = (visitorId: string, userId?: string) => {
  const p = new URLSearchParams({ visitor_id: visitorId });
  if (userId) p.set('user_id', userId);
  return api<Record<string, number>>(`/events/affinity?${p}`);
};

// Fetch a listing by its readable URL slug (/city/Title_Of_Listing permalink).
export const getListingBySlug = (slug: string) =>
  api<PublicListing>(`/listings/by-slug/${encodeURIComponent(slug)}`);

// Home page: admin-ordered sections (kinds + business categories) with items.
export interface HomeSection { id: string; type: 'kind' | 'cat' | 'ptype' | 'sale' | 'special'; key: string; label: string; emoji: string; total: number; items: PublicListing[] }
export const homeSections = (city?: string) =>
  api<HomeSection[]>(`/home/sections${city ? `?city=${encodeURIComponent(city)}` : ''}`);

// Admin: get/save the home section order (drag-drop).
export const adminGetHomeSequence = () => api<{ sequence: { id: string; type: string; key: string; label: string; emoji: string }[] }>('/admin/home-sequence');
export const adminSaveHomeSequence = (sequence: string[]) =>
  api('/admin/home-sequence', { method: 'PUT', body: JSON.stringify({ sequence }) });

export const visitorsToday = (city?: string) =>
  api<{ count: number }>(`/stats/visitors-today${city ? `?city=${encodeURIComponent(city)}` : ''}`);
export const postingsCount = (city?: string) =>
  api<{ count: number }>(`/stats/postings${city ? `?city=${encodeURIComponent(city)}` : ''}`);

// Admin contact-interest leads feed (who acted on which post's contact + how).
export const analyticsLeads = (page = 1) =>
  api<{ page: number; page_size: number; total: number; results: any[] }>(`/analytics/leads?page=${page}`);

// Admin USER REPORT — day-wise visitors split into new vs repeat.
export interface UserReportDay { day: string; new: number; repeat: number; total: number }
export interface UserReport {
  range: { from: string; to: string };
  days: UserReportDay[];
  totals: { unique: number; new: number; repeat: number };
}
export const userReport = (from: string, to: string) =>
  api<UserReport>(`/analytics/user-report?from=${from}&to=${to}`);

// CONTACT REPORT — day-wise contact actions by channel. Counts are deduped per
// (visitor, listing, day, channel), so repeat taps on one post in one day are 1.
export interface ContactReportDay { day: string; call: number; whatsapp: number; copy: number; total: number }
export interface ContactReport {
  range: { from: string; to: string };
  days: ContactReportDay[];
  totals: { call: number; whatsapp: number; copy: number; total: number; people: number; posts: number };
}
export const contactReport = (from: string, to: string) =>
  api<ContactReport>(`/analytics/contact-report?from=${from}&to=${to}`);

// Admin registered-users list (drill-in from the "Registered users" card).
export const registeredUsers = () =>
  api<{ results: any[] }>('/analytics/registered-users');

// Admin per-post analytics (drill-in from the "Number of posts" card).
export const postAnalytics = () =>
  api<{ results: any[] }>('/analytics/posts');

// Duplicate-posting check as the poster types the contact number. Uses whichever
// JWT is present (admin token when posting from the admin panel, else the user
// token) so it works in both contexts; the server scopes results to the caller.
export interface DupPosting { id: string; title: string; status: string; kind: string | null; category: string | null }
export async function checkDuplicate(mobile: string, kind: string, excludeId?: string, preferAdmin = false): Promise<{ results: DupPosting[] }> {
  const token = preferAdmin ? (getAdminToken() || getUserToken()) : (getUserToken() || getAdminToken());
  if (!token) return { results: [] };
  const res = await fetch('/api/v1/listings/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mobile, kind, exclude_id: excludeId }),
  });
  if (!res.ok) return { results: [] };
  return res.json() as Promise<{ results: DupPosting[] }>;
}

// Login-gate thresholds (after which an anon visitor must register).
export interface LoginGate { time_limit_minutes: number; contact_limit: number; daily_contact_limit: number }
export const getLoginGate = () => api<LoginGate>('/settings/login-gate');
export const adminSetLoginGate = (v: Partial<LoginGate>) =>
  api<LoginGate>('/admin/login-gate', { method: 'PUT', body: JSON.stringify(v) });

// Owner (or admin) edit of a single listing.
export const getFullListing = (id: string) => api<any>(`/listings/${id}/full`);
export const updateMyListing = (id: string, patch: any) =>
  api<{ _id: string }>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

// The logged-in user's own posts + hide/show.
export const myListings = () => api<any[]>('/listings/mine');
export const setMyListingActive = (id: string, active: boolean) =>
  api<{ _id: string; active: boolean }>(`/listings/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) });

export const pinLookup = (pin: string) =>
  api<{ pin: string; city: string; district: string; state: string; localities: string[] }>(
    `/utility/pin-lookup/${pin}`,
  );

export const reportListing = (id: string, reason: string, details: string) =>
  api(`/listings/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details, visitor_id: getVisitorId() }),
  });

export const revealPhone = (id: string) =>
  api<{ mobile: string; whatsapp: string; remaining_today: number }>(`/listings/${id}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ visitor_id: getVisitorId() }),
  });

export const createListing = (payload: any) =>
  api<{ _id: string; status: string }>('/listings', { method: 'POST', body: JSON.stringify(payload) });

// Admin create — uses the admin token (path-routed) and publishes immediately.
export const adminCreateListing = (payload: any) =>
  api<{ _id: string; status: string }>('/admin/listings', { method: 'POST', body: JSON.stringify(payload) });

// Autocomplete only — keywords are free; no dictionary management.
export const searchTags = (q: string, kind: string) =>
  api<Tag[]>(`/tags?q=${encodeURIComponent(q)}&kind=${kind}`);

// ---- admin ----
export const pendingListings = () => api<any[]>('/admin/listings/pending');
export const pendingCount = () => api<{ count: number }>('/admin/listings/pending/count');
export const adminGetListing = (id: string) => api<any>(`/admin/listings/${id}`);
export const adminUpdateListing = (id: string, patch: any) =>
  api<{ _id: string }>(`/admin/listings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const approveListing = (id: string) => api(`/admin/listings/${id}/approve`, { method: 'POST' });
export const rejectListing = (id: string) => api(`/admin/listings/${id}/reject`, { method: 'POST' });
export const adminReports = () => api<any[]>('/admin/reports');
export const reportAction = (listingId: string, action: string, note = '') =>
  api(`/admin/reports/${listingId}/action`, { method: 'POST', body: JSON.stringify({ action, note }) });
export const adminBrowse = (q = '', city = '') => {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (city) p.set('city', city);
  return api<SearchResponse>(`/admin/listings/browse?${p.toString()}`);
};
export const setListingActive = (id: string, active: boolean) =>
  api<{ _id: string; active: boolean }>(`/admin/listings/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) });
export const setListingPinned = (id: string, pinned: boolean) =>
  api<{ _id: string; pinned: boolean }>(`/admin/listings/${id}/pin`, { method: 'POST', body: JSON.stringify({ pinned }) });
