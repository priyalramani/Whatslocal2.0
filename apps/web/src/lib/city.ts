// Cities and URL slugs. /:city → home for that city; /:city/:kind → category.
export interface City { slug: string; name: string; pincode: string }

export const CITIES: Record<string, City> = {
  gondia: { slug: 'gondia', name: 'Gondia', pincode: '441601' },
};
export const DEFAULT_CITY = 'gondia';

// Cities the user reached via the pincode switcher are remembered in
// localStorage (keyed by slug) so resolveCity() can return the right NAME for
// the listings query even though it isn't hard-coded in CITIES above.
const REMEMBERED_KEY = 'wl_cities';

function readRemembered(): Record<string, City> {
  try {
    const raw = localStorage.getItem(REMEMBERED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function rememberCity(c: City): void {
  try {
    const map = readRemembered();
    map[c.slug] = c;
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify(map));
  } catch { /* ignore quota/serialization errors */ }
}

export function resolveCity(slug?: string): City {
  const key = (slug || '').toLowerCase();
  return CITIES[key] || readRemembered()[key] || CITIES[DEFAULT_CITY];
}

// The single most-recent city the user actively browsed. Drives the bare-URL
// (whatslocal.in) landing: redirect here if set, else prompt for a pincode.
// Distinct from wl_cities (the SET of every city the user has ever reached).
const LAST_KEY = 'wl_last_city';
export function getLastCity(): City | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && typeof c === 'object' && c.slug && c.name ? c : null;
  } catch { return null; }
}
export function setLastCity(c: City): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(c));
    rememberCity(c);   // so resolveCity(slug) also knows this city's name
  } catch { /* ignore quota/serialization errors */ }
}

// Reverse lookup: a stored city NAME ("Gondia") → its URL slug ("gondia").
const NAME_TO_SLUG: Record<string, string> =
  Object.fromEntries(Object.values(CITIES).map((c) => [c.name.toLowerCase(), c.slug]));

export function cityNameToSlug(name?: string): string {
  const n = (name || '').toLowerCase().trim();
  return NAME_TO_SLUG[n] || n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || DEFAULT_CITY;
}

// Canonical shareable path for a listing: /city/Readable_Title_Slug — readable,
// locally-flavoured, unique. Falls back to the legacy /l/:id for old rows that
// don't carry a slug yet.
export function listingPath(l: { city?: string; slug?: string; _id: string }): string {
  return l.slug ? `/${cityNameToSlug(l.city)}/${l.slug}` : `/l/${l._id}`;
}

// Listing-kind ↔ URL slug (clean, shareable).
export const KIND_TO_SLUG: Record<string, string> = {
  job_opening: 'job-opening',
  job_seeker: 'job-seeker',
  business: 'business',
  happening: 'happening',
};
export const SLUG_TO_KIND: Record<string, string> =
  Object.fromEntries(Object.entries(KIND_TO_SLUG).map(([k, v]) => [v, k]));
