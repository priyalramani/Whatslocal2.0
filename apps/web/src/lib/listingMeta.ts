import type { PublicListing, BusinessCategory } from '@whatslocal/types';
import { BUSINESS_CATEGORIES, sellCategoriesForMode, categoryLabelLocalized, searchJobCategories as searchJobCats } from '@whatslocal/types';

// Localize a category label (key or English label) for display. Thin wrapper so
// components can pass the `lang` from useT() without importing from @types.
export function catLabel(keyOrLabel: string, lang: 'en' | 'hi'): string {
  return categoryLabelLocalized(keyOrLabel, lang);
}

// Section metadata for the home groups + category pages.
export const KIND_INFO: Record<string, { label: string; emoji: string }> = {
  job_opening: { label: 'Job Openings', emoji: '💼' },
  job_seeker: { label: 'Job Seekers', emoji: '🙋' },
  happening: { label: 'Celebrations, Events', emoji: '🎉' },
  business: { label: 'Business, Professional, Services, Organization', emoji: '🏪' },
};
// Home section order — Jobs first.
export const SECTION_KINDS = ['job_opening', 'job_seeker', 'happening', 'business'];

const TINTS = [
  'bg-indigo-100', 'bg-emerald-100', 'bg-amber-100', 'bg-rose-100',
  'bg-sky-100', 'bg-violet-100', 'bg-teal-100', 'bg-orange-100',
];
export function tint(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

// Keyword → icon guesser (fallback when a poster doesn't pick a category).
// Ordered: specific first; service-trades BEFORE electronics ("electric" overlap);
// farm terms before generic dairy/milk. Maps the long tail into the buckets.
const ICON_MAP: [RegExp, string][] = [
  // Food & daily
  [/sweet|mithai|bakery|\bcake|farsan|namkeen|ice ?cream/, '🍰'],
  [/\bmeat\b|chicken|mutton|\bfish\b|\begg\b|fishery/, '🍗'],
  [/restaurant|hotel|dhaba|cafe|coffee|\btea\b|fast food|snack|chaat|\bjuice|tiffin|catering|\bfood\b/, '🍴'],
  [/vegetable|sabzi|fruit|\bmilk\b|dairy(?! farm)|paneer/, '🥦'],
  [/grocery|kirana|general store|provision|supermarket|daily needs|departmental|\bpan\b|gutkha|spices|masala|\batta\b|\brice\b|\bdal\b|ghee|pickle|papad/, '🛒'],
  // Health
  [/patholog|diagnostic|\blab\b|x-?ray|sonograph|scan cent|blood test/, '🧪'],
  [/pharmac|chemist|medical store|medicine|drug store|syrup|\btablet|injection|surgical/, '💊'],
  [/doctor|hospital|clinic|dentist|dental|physio|ayurved|homeopath|surgeon|gynec|\bortho|nursing home|eye care|\bent\b|nutritionist|dietician|psycholog|dermatolog|therapist/, '🩺'],
  [/\bvet\b|veterinary|\bpet\b|animal|snake|aquarium|\bdog\b|\bcat\b|gaushala|pashu/, '🐾'],
  [/\bgym\b|fitness|yoga|\bsport|cricket|football|badminton|turf|swimming|\bbat\b|racket|jersey|carrom|crossfit|pilates|zumba|calisthenic/, '💪'],
  // Beauty
  [/salon|parlou?r|beauty|barber|\bspa\b|makeup|mehendi|tattoo|waxing|pedicure|manicure|beautician|nail art|nail studio|grooming|\bmua\b/, '✂️'],
  // Home-service trades (BEFORE electronics so "electrician" ≠ electronics)
  [/plumb|carpenter|painter|\bmason\b|welder|fabricat|borewell|pest control|tank clean|house ?keep|cleaning service|flooring|tiles work|false ceiling|electrician|wireman|\bac repair|fridge repair|appliance repair|\bro\b service|water purifier|locksmith|key maker|handyman/, '🧰'],
  // Building & home
  [/hardware|sanitary|\bpaint|cement|building material|tiles|marble|granite|plywood|\bglass\b|\bsteel\b|sariya|\bsink\b|\btap\b|\bnail\b|\btools\b|putty|\bpop\b|\bmirror\b|screws/, '🛠️'],
  [/furniture|sofa|home decor|curtain|utensil|crockery|kitchenware|almirah|wardrobe|mattress/, '🛋️'],
  // Electronics / mobile
  [/mobile|smartphone|\bdth\b|recharge|electronic|electrical|\btv\b|fridge|refrigerat|washing machine|appliance|computer|laptop|cctv|charger|earphone|headphone|\bsim\b|cooler|\bfan\b|mixer|grinder|geyser|\bled\b|bulb|\bwire\b|\bswitch\b|\bmcb\b/, '📱'],
  // Auto
  [/\bcar\b|\bbike\b|two ?wheeler|scooter|motorcycle|automobile|\bauto\b|tractor|vehicle|garage|puncture|\btyre|spare part|car wash|battery|cycle/, '🚗'],
  // Clothing / personal retail
  [/cloth|garment|readymade|saree|\bsari\b|boutique|tailor|fashion|hosiery|jeans|t-?shirt|thread|button|\bzip\b|embroider|woolen|blanket|towel|bedsheet|uniform|dupatta|lehenga/, '👕'],
  [/footwear|\bshoe|chappal|sandal|\bbag\b|luggage/, '👟'],
  [/jewel|\bgold\b|silver|imitation/, '💍'],
  [/cosmetic|\bgift|\btoy|fancy|variety|perfume|pooja|agarbatti|\bwatch\b|\bclock\b/, '🎁'],
  [/stationer|notebook|copybook|\bbooks?\b|\bpen\b/, '📒'],
  // Education ("driving school" first, else "school" steals it)
  [/driving school|driving training/, '🚕'],
  [/school|college|coach|tuition|\bclass(es)?\b|education|training|institute|library|daycare|play ?school|kindergarten/, '📚'],
  // Architect / engineer / interior (construction professionals, not the trades)
  [/architect|civil engineer|structural engineer|interior design|building contractor|naksha|vastu|surveyor/, '📐'],
  // Professional / finance
  [/advocate|lawyer|legal|notary|\bcourt\b/, '⚖️'],
  [/\bca\b|accountant|account|\bgst\b|\btax\b|audit|book ?keep/, '🧾'],
  [/blood bank|blood donation/, '🤝'],
  [/\bbank\b|insurance|\bloan\b|finance|investment|mutual fund|money transfer|\bdsa\b|pawn|\batm\b/, '🏦'],
  [/propert|real estate|\bland\b|\bplot\b|\bflat\b|builder|\brent\b/, '🏠'],
  [/consultant|aadhaar|aadhar|pan card|\bcsc\b|registration|seva kendra|government|\bgovt\b/, '📋'],
  // Travel / personal services
  [/travel|taxi|\bcab\b|\btour|\bbus\b|courier|logistic|packers|movers|transport|driving school/, '🚕'],
  [/laundry|dry ?clean|cobbler|mochi|watch repair|photo fram|umbrella/, '🧺'],
  // Media & events
  [/print|flex|xerox|banner|hoarding|photocopy|\bdtp\b/, '🖨️'],
  [/photograph|videograph|photo studio/, '📷'],
  [/software|web develop|app develop|\bit company|\bit services|\bit support|coding|programmer|\bsaas\b|web design|computer software|startup|ecommerce/, '💻'],
  [/influencer|\bmarketing|social media|advertis|branding|\bpr\b|public relations|content creator|youtuber|\bseo\b|ad agency|promotion|graphic design/, '📣'],
  [/\bevent\b|anchor|emcee|\bdj\b|sound system|\btent\b|decorat|\bband\b|wedding planner|mandap|florist|flower|marriage hall|\blawn\b|orchestra/, '🎤'],
  // Agriculture
  [/seed|fertilizer|pesticide|\bagri|tractor|nursery|\bplant|cattle feed|poultry farm|dairy farm/, '🌱'],
  // Utility
  [/gas agency|cylinder|\bgas\b|water can|water supply|\bsolar\b|inverter|petrol|diesel/, '💧'],
  // Social
  [/\bngo\b|social|charity|trust|donation|blood bank|old age|orphan|foundation/, '🤝'],
];

// The category picker (business listings) is the shared catalog — single source
// of truth in @whatslocal/types (key/label/emoji + search synonyms).
export const CATEGORY_ICONS = BUSINESS_CATEGORIES;

// URL-safe slug for a category, for shareable category pages
// (e.g. "Furniture (Used)" → "furniture", "Property — House / Flat / …" →
// "property"). Uses the first segment so links stay short.
export function catSlug(label: string): string {
  return String(label || '').split('/')[0].split('—')[0]
    .replace(/\(used\)/ig, '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Emoji for a category (by key OR label) — used by the data-driven category rail.
// Searches the business catalog AND the sell/rent catalogs (so Bikes & Scooters,
// Property, etc. get their real icon, not the generic store fallback).
const ALL_CATS = [...BUSINESS_CATEGORIES, ...sellCategoriesForMode('sale'), ...sellCategoriesForMode('rent')];
export function categoryEmoji(keyOrLabel: string): string {
  const k = String(keyOrLabel || '').toLowerCase();
  const c = ALL_CATS.find((x) => x.key.toLowerCase() === k || x.label.toLowerCase() === k);
  return c?.emoji || '🏪';
}

// Category browse/search: match the typed text against a category's LABEL or any
// of its SYNONYMS, so "daily needs"→Grocery, "naksha"→Architect, etc. Defaults
// to the business catalog; pass `catalog` (e.g. SELL_CATEGORIES) to search a
// different one with the same matching rules.
export function searchCategories(query: string, catalog: BusinessCategory[] = BUSINESS_CATEGORIES) {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter((c) =>
    c.label.toLowerCase().includes(q) ||
    // synonym contains the query, OR the query contains a synonym (≥4 chars so a
    // short synonym like "ent" doesn't match "content").
    c.synonyms.some((s) => s.includes(q) || (s.length >= 4 && q.includes(s))),
  );
}

// Sibling helper for the Sell/Rent picker — searches the SELL_CATEGORIES catalog,
// narrowed to the categories valid for the chosen mode (sale vs rent).
export function searchSellCategories(query: string, mode: 'sale' | 'rent' = 'sale') {
  return searchCategories(query, sellCategoriesForMode(mode));
}

// Sibling helper for the Job picker (both hiring + job_seeker use ONE taxonomy).
// Thin re-export of the shared @types search so the picker imports from one place.
export function searchJobCategories(query: string) {
  return searchJobCats(query);
}

export function iconFor(l: PublicListing): string {
  if (l.icon) return l.icon;            // poster-chosen category icon
  if (l.kind === 'job_opening') return '💼';
  if (l.kind === 'job_seeker') return l.gender === 'male' ? '👨' : l.gender === 'female' ? '👩' : '🙋';
  if (l.kind === 'happening') return '🎉';
  const text = `${(l.keywords_cache || []).join(' ')} ${l.title || ''} ${l.job_role || ''}`.toLowerCase();
  for (const [re, e] of ICON_MAP) if (re.test(text)) return e;
  return '🏪';
}

const genderEmoji = (g?: string) => (g === 'male' ? '👨' : g === 'female' ? '👩' : g ? '🧑' : '');
const expShort = (m?: number | null) => (m == null ? '' : m < 1 ? 'Fresher' : m >= 12 ? `${Math.floor(m / 12)}y` : `${m}m`);
const kfmt = (n?: number | null) => (n == null ? '' : n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${n}`);
function salaryShort(l: PublicListing) {
  if (l.salary_min && l.salary_max) return `₹${kfmt(l.salary_min)}–${kfmt(l.salary_max)}`;
  if (l.salary_min) return `₹${kfmt(l.salary_min)}+`;
  if (l.salary_max) return `≤₹${kfmt(l.salary_max)}`;
  return '';
}

// Trim free text to a few words / chars so tiles stay one tidy line.
function clip(s: string, words = 6, maxLen = 38): string {
  const t = s.trim().replace(/\s+/g, ' ');
  let out = t.split(' ').slice(0, words).join(' ');
  if (out.length > maxLen) out = out.slice(0, maxLen).replace(/[ ,]+$/, '');
  return out.length < t.length ? out + '…' : out;
}

// Secondary line under the title. City/state is redundant (search is already
// city-scoped), so show something useful per kind instead: event date for a
// happening, address for a business, the role for a job.
export function subInfo(l: PublicListing): string {
  if (l.kind === 'happening') return l.event_date ? `📅 ${clip(String(l.event_date), 5, 26)}` : '';
  if (l.kind === 'business') {
    if (l.short_desc) return l.short_desc;   // tagline shown in full (≤27 chars)
    return l.address ? `📍 ${clip(l.address)}` : '';
  }
  return l.job_role || '';
}

// Short category label shown at the top of a card. For a business it's the
// chosen category (Grocery, Restaurant…); otherwise the listing kind.
const KIND_LABEL: Record<string, string> = {
  business: 'Business', job_opening: 'Job Opening', job_seeker: 'Job Seeker', happening: 'Happening',
};
export function categoryLabel(l: PublicListing): string {
  if (l.kind === 'business') return l.category || 'Business';
  // Jobs now carry a role category (e.g. "Cook", "Driver") — show it as the
  // eyebrow when set, falling back to the kind label for legacy job posts.
  if (l.kind === 'job_opening' || l.kind === 'job_seeker') {
    return l.categories?.[0] || l.category || KIND_LABEL[l.kind] || 'Listing';
  }
  if (l.kind === 'happening' && l.happening_type) return l.happening_type[0].toUpperCase() + l.happening_type.slice(1);
  return KIND_LABEL[l.kind || ''] || 'Listing';
}

// Colored TYPE chip shown on a card's thumbnail so mixed rails (Trending, "new
// in town") are scannable at a glance — color encodes the vertical, the label is
// the backup. `labelKey` resolves via i18n in the component (bilingual).
export function typeTag(l: PublicListing): { labelKey: string; cls: string } {
  // Jobs: an employer vacancy vs a person seeking work are opposites — same
  // purple FAMILY (both are "jobs") but different shades so you can tell which.
  if (l.kind === 'job_opening') return { labelKey: 'tag.hiring', cls: 'bg-violet-100 text-violet-700' };
  if (l.kind === 'job_seeker') return { labelKey: 'tag.seeker', cls: 'bg-indigo-100 text-indigo-700' };
  // Happenings: event vs news share pink (same vertical), label distinguishes.
  if (l.kind === 'happening' || l.post_type === 'happening')
    return { labelKey: l.happening_type === 'news' ? 'tag.news' : 'tag.event', cls: 'bg-pink-100 text-pink-700' };
  // Buy/sell/rent: sale_or_rent splits the two; both live under post_type 'sell'.
  if (l.post_type === 'sell' || l.post_type === 'other')
    return l.sale_or_rent === 'rent'
      ? { labelKey: 'tag.forRent', cls: 'bg-amber-100 text-amber-700' }
      : { labelKey: 'tag.forSale', cls: 'bg-sky-100 text-sky-700' };
  // Everything else = a business/service listing.
  return { labelKey: 'tag.business', cls: 'bg-emerald-100 text-emerald-700' };
}

// 1–2 most relevant facts, by kind — for the compact HOME tiles.
export function meta(l: PublicListing): string[] {
  if (l.kind === 'job_seeker') {
    const out: string[] = [];
    const ge = genderEmoji(l.gender);
    if (l.age) out.push(`${ge || '🎂'} ${l.age} yrs`); else if (ge) out.push(`${ge} ${l.gender}`);
    if (l.experience_months != null) out.push(`🛠️ ${expShort(l.experience_months)} exp`);
    return out;
  }
  if (l.kind === 'job_opening') {
    const out: string[] = [];
    const s = salaryShort(l); if (s) out.push(`💰 ${s}`);
    if (l.experience_required_months) out.push(`🛠️ ${expShort(l.experience_required_months)} req`);
    if (!out.length && l.job_timing) out.push(`🕐 ${l.job_timing}`);
    return out;
  }
  return [];
}

const JT: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship', any: 'Any' };
const DAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Open-now from today's schedule (null if no hours set).
export function openNow(week?: { day: string; open: boolean; from: string; to: string }[]): boolean | null {
  if (!week?.length) return null;
  const t = week.find((d) => d.day === DAYS_ABBR[new Date().getDay()]);
  if (!t) return null;
  if (!t.open) return false;
  const toMin = (s: string) => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= toMin(t.from) && cur <= toMin(t.to);
}

// Richer fact set for the wider "See all" / category ROW cards (more space).
export function metaFull(l: PublicListing): string[] {
  if (l.kind === 'job_opening') {
    const out: string[] = [];
    const s = salaryShort(l); if (s) out.push(`💰 ${s}`);
    if (l.experience_required_months) out.push(`🛠️ ${expShort(l.experience_required_months)} req`);
    if (l.job_type && JT[l.job_type]) out.push(`🕐 ${JT[l.job_type]}`);
    if (l.vacancies) out.push(`👥 ${l.vacancies} open`);
    if (l.gender_required && l.gender_required !== 'both') out.push(`${genderEmoji(l.gender_required)} ${l.gender_required} only`);
    if (l.address) out.push(`📍 ${clip(l.address, 4, 22)}`);
    if (!s && l.job_timing) out.push(`🕐 ${l.job_timing}`);
    return out;
  }
  if (l.kind === 'job_seeker') {
    const out: string[] = [];
    const ge = genderEmoji(l.gender);
    if (l.age) out.push(`${ge || '🎂'} ${l.age} yrs`); else if (ge) out.push(`${ge} ${l.gender}`);
    if (l.experience_months != null) out.push(`🛠️ ${expShort(l.experience_months)} exp`);
    if (l.expected_salary) out.push(`💰 ₹${kfmt(l.expected_salary)}`);
    if (l.job_type && JT[l.job_type]) out.push(`🕐 ${JT[l.job_type]}`);
    if (l.languages?.length) out.push(`🗣️ ${l.languages.slice(0, 2).join(', ')}`);
    if (l.address) out.push(`📍 ${clip(l.address, 4, 22)}`);
    return out;
  }
  if (l.kind === 'business') {
    const out: string[] = [];
    const o = openNow(l.week_hours);
    if (o === true) out.push('🟢 Open now'); else if (o === false) out.push('⚪ Closed');
    if (l.established_year) out.push(`📅 Since ${l.established_year}`);
    return out;
  }
  if (l.kind === 'happening') {
    const out: string[] = [];
    if (l.happening_type) out.push(l.happening_type[0].toUpperCase() + l.happening_type.slice(1));
    if (l.event_date) out.push(`📅 ${clip(String(l.event_date), 4, 22)}`);
    return out;
  }
  return [];
}
