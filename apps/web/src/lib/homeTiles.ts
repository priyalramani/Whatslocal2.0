// Home category tiles: 3 fixed (Offers / New / Post) + 3 dynamic, personalized.
// Ranking blends v1 (this device's tile taps, localStorage) + v2 (server-computed
// vertical affinity from browsing) + time-of-day + content volume, and SKIPS any
// vertical with zero listings. Everything degrades safely: if the server signals
// fail, it falls back to volume + time.

export interface Tile {
  key: string;
  labelKey: string;
  emoji: string;
  href: (citySlug: string) => string;
  countKey?: string;   // key in vertical-counts; undefined = always eligible
}

// Candidate pool for the 3 dynamic slots.
export const DYNAMIC_POOL: Tile[] = [
  { key: 'business', labelKey: 'tiles.business', emoji: '🏪', href: (s) => `/${s}/business`, countKey: 'business' },
  { key: 'sell', labelKey: 'tiles.sell', emoji: '🛒', href: (s) => `/${s}/sell`, countKey: 'sell' },
  { key: 'rent', labelKey: 'tiles.rent', emoji: '🏠', href: (s) => `/${s}/rent`, countKey: 'rent' },
  { key: 'jobs', labelKey: 'tiles.jobs', emoji: '💼', href: (s) => `/${s}/job-opening`, countKey: 'jobs' },
  { key: 'complaints', labelKey: 'tiles.complaints', emoji: '🏛️', href: (s) => `/${s}/complaints` },
  { key: 'happening', labelKey: 'tiles.happening', emoji: '🎉', href: (s) => `/${s}/happening`, countKey: 'happening' },
];

// Fixed tiles (always shown, same slots).
export const FIXED_TILES: Tile[] = [
  { key: 'offers', labelKey: 'tiles.offers', emoji: '🏷️', href: (s) => `/${s}/offers` },
  { key: 'new', labelKey: 'tiles.new', emoji: '🆕', href: (s) => `/${s}/new` },
  { key: 'post', labelKey: 'tiles.post', emoji: '➕', href: () => '/post' },
];

const BUMP_KEY = 'wl_vtiles';
const SESS_KEY = 'wl_dyn_tiles';
const readBumps = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(BUMP_KEY) || '{}'); } catch { return {}; } };
// Called when a tile is tapped — the v1 behaviour signal.
export const bumpVertical = (key: string) => {
  try { const b = readBumps(); b[key] = (b[key] || 0) + 1; localStorage.setItem(BUMP_KEY, JSON.stringify(b)); } catch { /* ignore */ }
};

function timeBoost(key: string): number {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return key === 'jobs' ? 2 : 0;        // morning → jobs
  if (h >= 11 && h < 16) return key === 'business' ? 2 : 0;   // midday → shops
  if (h >= 17 && h < 23) return key === 'sell' ? 2 : key === 'business' ? 1 : 0; // evening → browsing
  return 0;
}

export function rankDynamic(counts: Record<string, number> = {}, affinity: Record<string, number> = {}, take = 3): Tile[] {
  const bumps = readBumps();
  const maxCount = Math.max(1, ...Object.values(counts || {}).map((n) => Number(n) || 0));
  // skip-empty: drop a vertical only if we KNOW it has 0 listings (counts present)
  const eligible = DYNAMIC_POOL.filter((t) => (t.countKey ? (counts?.[t.countKey] ?? 1) > 0 : true));
  const scored = eligible.map((t) => {
    const behaviour = bumps[t.key] || 0;               // v1
    const aff = affinity?.[t.key] || 0;                // v2
    const pop = t.countKey ? (Number(counts?.[t.countKey]) || 0) / maxCount : 0.5;
    const score = 5 * behaviour + 4 * aff + timeBoost(t.key) + 0.2 * pop;
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, take).map((s) => s.t);
}

// Session-stable ordering so the home doesn't reshuffle on every visit.
export function loadCachedDynamic(): Tile[] | null {
  try {
    const keys: string[] = JSON.parse(sessionStorage.getItem(SESS_KEY) || '[]');
    const map = new Map(DYNAMIC_POOL.map((t) => [t.key, t]));
    const r = keys.map((k) => map.get(k)).filter(Boolean) as Tile[];
    return r.length ? r : null;
  } catch { return null; }
}
export function saveCachedDynamic(tiles: Tile[]) {
  try { sessionStorage.setItem(SESS_KEY, JSON.stringify(tiles.map((t) => t.key))); } catch { /* ignore */ }
}
