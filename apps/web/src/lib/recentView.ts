import type { PublicListing } from '@whatslocal/types';

// Vertical bucket for a listing — MUST match the affinity keys the server
// returns (business / jobs / sell / rent / happening).
export function verticalOf(l: Partial<PublicListing>): string {
  if (l.kind === 'job_opening' || l.kind === 'job_seeker') return 'jobs';
  if (l.kind === 'happening' || l.post_type === 'happening') return 'happening';
  if (l.post_type === 'sell' || l.post_type === 'other') return l.sale_or_rent === 'rent' ? 'rent' : 'sell';
  return 'business';
}

// A short history of the listings this device opened — the basis for the home
// feed's blended "more like what you saw" rail. Newest first, deduped by id,
// capped. A share-lander's first touch seeds it immediately.
export interface LastListing { id: string; title: string; vertical: string; category: string; kind: string; city: string; ts: number }
const KEY = 'wl_recent_views';
const MAX = 12;

export function setLastListing(l: PublicListing): void {
  try {
    const e: LastListing = {
      id: l._id,
      title: l.title || '',
      vertical: verticalOf(l),
      category: (l.categories?.[0] || l.category || '') as string,
      kind: l.kind || '',
      city: l.city || '',
      ts: Date.now(),
    };
    const hist = getRecentViews().filter((x) => x.id !== e.id);
    hist.unshift(e);
    localStorage.setItem(KEY, JSON.stringify(hist.slice(0, MAX)));
  } catch { /* storage disabled — feed just falls back to non-seeded rails */ }
}

export function getRecentViews(): LastListing[] {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as LastListing[]) : []; }
  catch { return []; }
}

// Back-compat: the single most-recent view (FeedPage's "float my interest").
export function getLastListing(): LastListing | null { return getRecentViews()[0] || null; }

// Top recent DISTINCT categories, recency- AND frequency-weighted — a category
// looked at repeatedly and recently outranks one glanced once. Drives the
// blended home rail. Scoped to the given city when the views carry one.
export function topRecentCategories(city?: string, n = 3): { category: string; vertical: string; kind: string }[] {
  const hist = getRecentViews().filter((e) => e.vertical && (!city || !e.city || e.city.toLowerCase() === city.toLowerCase()));
  const score = new Map<string, { s: number; category: string; vertical: string; kind: string }>();
  hist.forEach((e, i) => {
    // Group by category, but fall back to the VERTICAL when a listing has no
    // category (jobs are often untagged) — otherwise those views vanish.
    const key = e.category || e.vertical;
    const cur = score.get(key) || { s: 0, category: e.category, vertical: e.vertical, kind: e.kind };
    cur.s += 1 / (i + 1);   // newer = heavier; repeats accumulate as frequency
    score.set(key, cur);
  });
  return [...score.values()]
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((v) => ({ category: v.category, vertical: v.vertical, kind: v.kind }));
}
