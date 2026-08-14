import {
  Injectable, NotFoundException, UnauthorizedException, HttpException, HttpStatus, BadRequestException, ForbiddenException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  maskTitle, calcAge, postTypeToKind, CATEGORY_BY_LABEL, CATEGORY_BY_KEY,
  defaultHomeSequence, slugifyTitle, type PostType,
} from '@whatslocal/types';
import { Listing, ListingDocument } from './listing.schema';
import { Reveal, RevealDocument } from './reveal.schema';
import { Report, ReportDocument } from './report.schema';
import { ModAction, ModActionDocument } from './moderation.schema';
import { AppConfig, AppConfigDocument } from './config.schema';
import { Visibility, VisibilityDocument } from './visibility.schema';
import { TagsService } from '../tags/tags.service';
import { AuthService } from '../auth/auth.service';
import { PincodeService } from '../utility/pincode.service';
import { CreateListingDto } from './dto';
import { buildCardSvg, buildPhotoOverlaySvg, type CardInput } from './og-card';
import sharp from 'sharp';
import { promises as fsp } from 'fs';
import { randomBytes } from 'crypto';

export interface PostContext {
  userId: string;
  role: string;
  userMobile: string;
}

const PAGE_SIZE = 20;
const ANON_LIMIT = Number(process.env.REVEAL_ANON_LIMIT) || 3;   // default free contacts before login (admin-tunable)
const DAILY_LIMIT = Number(process.env.REVEAL_DAILY_LIMIT) || 5; // default daily contact cap (admin-tunable)
// Contact-reveal "day" key in IST — the daily cap resets at 12am India time
// (not UTC midnight), so shift by +5:30h before taking the calendar date.
function istDay(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// Login-gate thresholds are admin-tunable via app_config 'login_gate'; cached
// 60s so the hot reveal() path doesn't hit the DB every time (singleton service).
let gateCache: { at: number; val: { time_limit_minutes: number; contact_limit: number; daily_contact_limit: number } } | null = null;
// Disk cache for pre-rendered share-card PNGs; nginx serves these directly.
const OG_DIR = process.env.OG_CACHE_DIR || '/var/www/whatslocal-og';
// Uploaded listing photos (compressed derivatives), served by nginx at /media/.
const MEDIA_DIR = process.env.MEDIA_DIR || '/var/www/whatslocal-media';

// Default keywords auto-attached to job posts (bilingual). Users don't type
// keywords for jobs — the role + these make them findable.
const JOB_BASE_KEYWORDS = ['job', 'jobs', 'naukri', 'vacancy', 'rojgar', 'employment', 'work', 'kaam'];
const JOB_HIRING_KEYWORDS = ['hiring', 'staff required', 'staff wanted', 'helper wanted', 'recruitment', 'job opening', 'urgent requirement', 'staff chahiye'];
const JOB_SEEKER_KEYWORDS = ['job seeker', 'candidate', 'looking for job', 'job chahiye', 'need job', 'fresher', 'experienced'];

// "YYYY-MM-DD" for (today - age years) — used to turn an age filter into dob bounds.
function dobFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

// Normalize for substring matching: lowercase, strip spaces/punctuation. This
// is what makes "paper"→"paperboat", "paper boat"→"paperboat" and "tooyums"→
// "too"+"yums" all match (whole-word $text can't do that).
export const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Random ~10-char slug for hidden-name listings (so the URL never leaks the name).
const randomSlug = () => (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 10) || 'listing';

// Clean a business's chosen categories: keep valid labels, dedupe, max 3.
// Falls back to a single `category` for back-compat.
function normalizeCategories(categories?: string[], category?: string): string[] {
  const raw = categories?.length ? categories : (category ? [category] : []);
  const seen = new Set<string>(); const out: string[] = [];
  for (const c of raw) {
    if (CATEGORY_BY_LABEL[c] && !seen.has(c)) { seen.add(c); out.push(c); }
    if (out.length >= 3) break;
  }
  return out;
}

// Filler words that shouldn't constrain a search. The city is added at query
// time (search is already city-scoped, so "...in gondia" must not require it).
const STOPWORDS = new Set([
  // filler words
  'in', 'at', 'on', 'the', 'for', 'of', 'and', 'or', 'near', 'nearby', 'my', 'your',
  'our', 'to', 'a', 'an', 'is', 'are', 'with', 'best', 'top', 'good', 'me', 'ke', 'ki',
  'ka', 'aur', 'hai', 'mein', 'wala', 'wale',
  // generic retail nouns — too broad to be useful as a search term (they match
  // half the directory by title). The real intent word ("namkeen") carries it.
  'shop', 'shops', 'store', 'stores', 'centre', 'center', 'point', 'mart',
  'dukan', 'dukaan',
]);
// Variants of a token to try (handles simple plurals: distributors→distributor).
const variants = (t: string) => (t.length > 3 && t.endsWith('s') ? [t, t.slice(0, -1)] : [t]);

// Split a query into meaningful tokens → groups of substring variants. Drops
// stopwords and the (city-scoped) city name so they don't force-fail a match.
function queryGroups(q: string, city?: string): string[][] {
  const cityN = norm(city || '');
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const raw of String(q).toLowerCase().split(/\s+/)) {
    const t = norm(raw);
    if (t.length < 2 || STOPWORDS.has(t) || t === cityN || seen.has(t)) continue;
    seen.add(t);
    groups.push(variants(t));
  }
  return groups;
}

// ===== Spelling correction (only ever runs when a search found NOTHING) =====
// Real zero-result queries from the log: "jib"→job, "gindia"→gondia,
// "luon"→lion, "meeicine"→medicine, "patha"→pathology, "sarvan"→shravan.
// Note the shapes: one wrong letter, two letters swapped, and a typo inside a
// word the visitor was still typing. So we need edit distance WITH transposition
// (Damerau), plus a prefix comparison, plus a phonetic key for names whose
// English spelling genuinely varies.

// Damerau-Levenshtein, capped: we only care whether it's within `max`, and
// bailing early keeps the vocabulary scan cheap.
function editDistance(a: string, b: string, max: number): number {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev2: number[] = [], prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur = [i];
    let best = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // transposition ("luon" → "lion", "sarvan" → "sravan")
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;      // whole row already too far — stop
    prev2 = prev; prev = cur;
  }
  return prev[bl];
}

// Collapse the spellings that vary when an Indian name or word is written in
// English — aspirated consonants, v/w, s/sh, c/k, z/j, long vowels, doubles.
// "shravan"/"sarvan" and "kamal"/"kamaal" land on the same key.
function phoneticKey(s: string): string {
  const w = String(s).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  return w
    .replace(/ph/g, 'f').replace(/gh/g, 'g').replace(/kh/g, 'k')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b')
    .replace(/ch/g, 'c').replace(/sh/g, 's')
    .replace(/[wv]/g, 'v').replace(/[zj]/g, 'j').replace(/[qk]/g, 'k').replace(/y/g, 'i')
    .replace(/[aeiou]+/g, 'a')     // every vowel run → one 'a'
    .replace(/(.)\1+/g, '$1');     // de-double
}

// How far off a token may be before we refuse to guess. Short words are left
// alone unless they're one edit away — "cat"/"car"/"can" are all one apart and
// "correcting" between them would be worse than showing nothing.
function allowedEdits(len: number): number {
  if (len < 3) return 0;
  if (len <= 4) return 1;
  return 2;
}

// Relevance scoring on NORMALIZED text (agrees with the substring matcher).
//  - coverage: how many query tokens the listing matches (PRIMARY) — match more
//    of the query, rank higher. A token counts if any of its variants hits.
//  - score: field weights are CUMULATIVE, so a token in MORE places scores
//    higher (title+keywords beats title alone): title 10, keywords 6, short 4,
//    description 2, synonym-only 1. Plus exact/prefix title bonuses.
// Caller then tie-breaks by popularity (views), then recency.
function relevance(d: any, groups: string[][], rawQ: string): { coverage: number; score: number } {
  const nTitle = norm(d.title);
  const nKw = norm((d.keywords_cache || []).join(' '));
  const nShort = norm(d.short_desc);
  const nDesc = norm(d.description);
  const nBlob = norm(d.search_blob);
  let coverage = 0, score = 0;
  for (const group of groups) {
    const inField = (f: string) => group.some((t) => f.includes(t));  // any variant
    let s = 0, hit = false;
    if (inField(nTitle)) { s += 10; hit = true; }
    if (inField(nKw)) { s += 6; hit = true; }
    if (inField(nShort)) { s += 4; hit = true; }
    if (inField(nDesc)) { s += 2; hit = true; }
    if (!hit && inField(nBlob)) { s += 1; hit = true; }   // matched only via synonym
    if (hit) { coverage += 1; score += s; }
  }
  const nq = norm(rawQ);
  if (nq && nTitle === nq) score += 30;
  else if (nq && nTitle.startsWith(nq)) score += 15;
  else if (nq && nTitle.includes(nq)) score += 8;
  return { coverage, score };
}

// ===== Balanced default ranking (browse + home, no search query) =====
// score = durable popularity (log of views) + a "new listing" boost that halves
// weekly (from FIRST-posted date, so edits don't game it) + a tiny per-day jitter
// so near-tied listings gently rotate day to day. Higher = shown first. This gives
// brand-new posts real exposure to earn views, while genuinely popular listings
// still hold the top; stale + ignored listings sink.
const FRESH_BONUS = 1.5;            // starting boost for a brand-new listing
const FRESH_HALFLIFE_DAYS = 7;     // boost halves each week (~gone in a month)
const JITTER_MAX = 0.1;            // tiny daily shuffle, only reorders near-ties
const RANK_POOL_CAP = 500;         // candidates ranked in memory (local scale)
const EVENT_BASE = 50;             // upcoming events sit above everything in a happening feed
// Two manual/provenance overrides, both applied ON TOP of the score above so they
// reorder within a result set but never pull in something that doesn't belong.
const PINNED_BOOST = 100;          // admin pin — leads its feed (above even events)
const SELF_BOOST = 10;             // the owner posted it themselves: fresher and
                                   // accountable, so it outranks bulk admin entries.
                                   // Kept under EVENT_BASE so events still headline.
const MONTHS_RE = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;

function daySeed(): string { return new Date().toISOString().slice(0, 10); }   // YYYY-MM-DD
// Deterministic small bump per (listing, day) via an FNV-1a hash → [0, JITTER_MAX).
function jitterFor(id: string, seed: string): number {
  let h = 2166136261;
  const s = id + seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 1000) / 1000 * JITTER_MAX;
}
// TRANSACTIONAL listings get "consumed" and go stale (a hired seeker, a filled
// opening, a sold item, yesterday's news) — so FRESHNESS + fair rotation should
// rank them, NOT lifetime views (a popular-but-done post would bury fresh ones,
// and views ≠ relevance for the employer/buyer). Business/Info/Other are
// evergreen — they keep the popularity term. Events are date-anchored (below).
function isTransactional(d: any): boolean {
  const k = d?.kind, pt = d?.post_type, ht = d?.happening_type;
  if (k === 'job_seeker' || k === 'job_opening') return true;   // hired / filled → stale
  if (pt === 'sell') return true;                               // sold → stale
  if (k === 'happening' && ht === 'news') return true;          // old news → stale
  return false;
}
// Best-effort parse of the FREE-TEXT event_date — only when confident (ISO
// yyyy-mm-dd, or a written month + 4-digit year). Ambiguous slash dates
// (12/08/2026 = Dec or Aug?) return null so we NEVER hide/reorder on a guess.
function parseEventDate(s: any): number | null {
  const str = String(s || '').trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const t = Date.parse(str.slice(0, 10)); return Number.isNaN(t) ? null : t; }
  if (MONTHS_RE.test(str) && /\b(19|20)\d{2}\b/.test(str)) { const t = Date.parse(str); return Number.isNaN(t) ? null : t; }
  return null;
}
// A happening event whose date is CONFIDENTLY before today → hide it entirely.
function isPastEvent(d: any, todayStartMs: number): boolean {
  if (d?.kind !== 'happening' || d?.happening_type !== 'event') return false;
  const ev = parseEventDate(d?.event_date);
  return ev != null && ev < todayStartMs;
}
// Owner/curation overrides. `source` is 'admin' only for listings the team keyed
// in on someone's behalf; anything a real user posted from the app counts as self.
function isSelfPosted(d: any): boolean { return d?.source !== 'admin'; }
function overrideBoost(d: any): number {
  return (d?.pinned ? PINNED_BOOST : 0) + (isSelfPosted(d) ? SELF_BOOST : 0);
}
function rankScore(d: any, nowMs: number, seed: string): number {
  const boost = overrideBoost(d);
  const created = d?.createdAt ? new Date(d.createdAt).getTime() : nowMs;
  const ageDays = Math.max(0, (nowMs - created) / 86_400_000);
  const freshness = FRESH_BONUS * Math.pow(0.5, ageDays / FRESH_HALFLIFE_DAYS);
  const jit = jitterFor(String(d?._id), seed);
  // Upcoming events headline the happening feed, SOONEST first (past ones are
  // already filtered out); an unparseable date falls back to freshness.
  if (d?.kind === 'happening' && d?.happening_type === 'event') {
    const ev = parseEventDate(d?.event_date);
    if (ev != null) { const daysUntil = Math.max(0, (ev - nowMs) / 86_400_000); return boost + EVENT_BASE + 1 / (1 + daysUntil) + jit; }
    return boost + freshness + jit;
  }
  // Transactional → freshness + rotation, NO popularity.
  if (isTransactional(d)) return boost + freshness + jit;
  // Evergreen (business / happening-info / other) → popularity + freshness + rotation.
  return boost + Math.log10(1 + (Number(d?.views) || 0)) + freshness + jit;
}
function rankBalanced<T extends { _id: any; views?: any; createdAt?: any }>(docs: T[]): T[] {
  const nowMs = Date.now();
  const seed = daySeed();
  const todayStart = new Date(nowMs); todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  return docs
    .filter((d) => !isPastEvent(d, todayStartMs))   // drop finished events
    .map((d) => ({ d, s: rankScore(d, nowMs, seed) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d);
}

// Coerce a posted weekly schedule to a safe, fixed shape.
function cleanWeek(w: any): { day: string; open: boolean; from: string; to: string }[] {
  if (!Array.isArray(w)) return [];
  return w.slice(0, 7).map((d) => ({
    day: String(d?.day || '').slice(0, 3),
    open: Boolean(d?.open),
    from: String(d?.from || '').slice(0, 8),
    to: String(d?.to || '').slice(0, 8),
  }));
}

// Fields that are NEVER sent to the public. Defense lives here, on the server.
// Vertical bucket for a listing — matches the affinity keys + the web's
// verticalOf(), so "New in town" can round-robin by vertical and float the
// visitor's interest.
function listingVertical(d: any): string {
  if (d.kind === 'job_opening' || d.kind === 'job_seeker') return 'jobs';
  if (d.kind === 'happening' || d.post_type === 'happening') return 'happening';
  if (d.post_type === 'sell' || d.post_type === 'other') return d.sale_or_rent === 'rent' ? 'rent' : 'sell';
  return 'business';
}

// ANTI-STUFFING: only the first N words of long free text feed the SEARCH index.
// The full description still displays on the listing — but padding it with a
// paragraph of keywords buys no extra search reach, which is the whole incentive.
function blobClip(text?: string | null, n = 40): string {
  return String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

// URL-safe category slug — MUST mirror the web's catSlug() so a shared category
// page (/browse/sell/furniture) resolves back to the right category server-side.
function catSlug(label: string): string {
  return String(label || '').split('/')[0].split('—')[0]
    .replace(/\(used\)/ig, '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// Short display label from a category (first segment, no "(Used)").
function shortCat(label: string): string {
  return String(label || '').split('/')[0].split('—')[0].replace(/\(used\)/i, '').trim();
}

export function toPublic(d: any) {
  // Strip EVERY sensitive / internal field. `has_phone` is a safe boolean kept in.
  // Audit metadata (poster number/id, approver, source) is admin-only — never public.
  const {
    mobile, alt_phone, whatsapp, search_blob, search_norm, keywords_cache, dob, views, score,
    posted_by_mobile, posted_by_user_id, approved_by, approved_at, source,
    ...rest
  } = d;
  // Expose AGE, never the exact date of birth (PII).
  const age = dob ? calcAge(dob, new Date().toISOString()) : null;
  // hide_number = fully private contact: no "Show number" button, no call/whatsapp.
  const hidden = Boolean((d as any).hide_number);
  return {
    ...rest,
    _id: String(d._id),
    title: maskTitle(d.title, d.hide_title),
    has_phone: Boolean(d.has_phone) && !hidden,
    // Channel availability is decided at WRITE time — the poster gives one
    // number, ticks Call / WhatsApp, and may supply a different number for
    // either — so `create` guarantees these flags already account for whether a
    // number actually backs the channel. Trust them here.
    // Do NOT re-derive from mobile/whatsapp: several endpoints project the phone
    // fields away, which made `!!mobile` false and silently reported "no
    // channels" on every listing — the contact sheet was left offering Copy
    // alone. The flags must not depend on fields a projection can remove.
    call_ok: (rest as any).call_ok !== false && !hidden,
    whatsapp_ok: (rest as any).whatsapp_ok !== false && !hidden,
    age,
  };
}

@Injectable()
export class ListingsService implements OnModuleInit {
  constructor(
    @InjectModel(Listing.name) private readonly listings: Model<ListingDocument>,
    @InjectModel(Reveal.name) private readonly reveals: Model<RevealDocument>,
    @InjectModel(Report.name) private readonly reports: Model<ReportDocument>,
    @InjectModel(ModAction.name) private readonly modActions: Model<ModActionDocument>,
    @InjectModel(AppConfig.name) private readonly config: Model<AppConfigDocument>,
    @InjectModel(Visibility.name) private readonly vis: Model<VisibilityDocument>,
    private readonly tagsSvc: TagsService,
    private readonly auth: AuthService,
    private readonly pins: PincodeService,
  ) {}

  // One-time, idempotent backfill: give any pre-slug listings a readable unique
  // slug. Cheap no-op once every row has one (a single indexed find returns []).
  async onModuleInit(): Promise<void> {
    // 1) Backfill any pre-slug listings.
    const missing = await this.listings
      .find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] }, { title: 1, hide_title: 1 })
      .lean();
    for (const d of missing) {
      const slug = await this.uniqueSlug((d as any).title || 'listing', String(d._id), !!(d as any).hide_title);
      await this.listings.updateOne({ _id: d._id }, { $set: { slug } });
    }
    // 2) Privacy: a hidden-name listing must NOT leak the name in its slug. Fix
    //    any whose slug is still derived from the title → re-mint a random one.
    const hidden = await this.listings.find({ hide_title: true }, { title: 1, slug: 1 }).lean();
    for (const d of hidden) {
      const cur = String((d as any).slug || '');
      const leakRx = new RegExp('^' + escapeRe(slugifyTitle((d as any).title || '')) + '(_\\d+)?$', 'i');
      if (cur && slugifyTitle((d as any).title || '') && leakRx.test(cur)) {
        const slug = await this.uniqueSlug('', String(d._id), true);
        await this.listings.updateOne({ _id: d._id }, { $set: { slug } });
      }
    }
    // 3) Renamed sell categories — dropped the "(Used)" suffix so Cars / Bikes
    //    work for rent too. Stored category is the LABEL, so migrate old rows.
    const CAT_RENAMES: Record<string, string> = {
      'Cars (Used)': 'Cars',
      'Bikes & Scooters (Used)': 'Bikes & Scooters',
      // Merged "Hardware/Paint/Building" + "Home Repair & Services" → one category.
      'Hardware / Paint / Building': 'Home Repair Services',
      'Home Repair & Services': 'Home Repair Services',
    };
    for (const [oldL, newL] of Object.entries(CAT_RENAMES)) {
      await this.listings.updateMany({ category: oldL }, { $set: { category: newL } });
      await this.listings.updateMany(
        { categories: oldL },
        { $set: { 'categories.$[e]': newL } },
        { arrayFilters: [{ e: oldL }] },
      );
    }
    // De-dup: a listing in BOTH merged categories now has the label twice — collapse.
    await this.listings.updateMany(
      { categories: 'Home Repair Services' },
      [{ $set: { categories: { $setUnion: ['$categories', []] } } }] as any,
    );
    // Drop the merged-away category key from any saved home sequence.
    await this.config.updateOne({ key: 'home_sequence' }, { $pull: { value: 'cat:hardware' } } as any);
    // Split the old combined "Sell / Rent" section into separate Sell + Rent
    // sections in any saved home order (replace ptype:sell in place).
    {
      const c = await this.config.findOne({ key: 'home_sequence' }).lean();
      const seq = (c?.value as string[]) || [];
      const i = seq.indexOf('ptype:sell');
      if (i !== -1) {
        seq.splice(i, 1, 'sale:sale', 'sale:rent');
        await this.config.updateOne({ key: 'home_sequence' }, { $set: { value: seq } });
      }
    }
    // Add the Ward Complaints special section to an existing saved order (once).
    {
      const c = await this.config.findOne({ key: 'home_sequence' }).lean();
      const seq = (c?.value as string[]) || [];
      if (seq.length && !seq.includes('special:complaints')) {
        seq.unshift('special:complaints');
        await this.config.updateOne({ key: 'home_sequence' }, { $set: { value: seq } });
      }
    }
    // 4) Periodic orphaned-image cleanup (abandoned uploads, replaced photos).
    setTimeout(() => void this.sweepOrphanMedia(), 60_000);
    const sweep = setInterval(() => void this.sweepOrphanMedia(), 12 * 60 * 60 * 1000);
    sweep.unref?.();   // don't keep the process alive for the timer

    // 5) Spelling vocabulary — built from what's actually listed, so corrections
    //    can only ever point at words that exist in THIS directory.
    setTimeout(() => void this.buildVocab(), 15_000);
    const vocab = setInterval(() => void this.buildVocab(), 30 * 60 * 1000);
    vocab.unref?.();
  }

  // ---- spelling vocabulary ----
  // word → how often it appears. Frequency breaks ties: between two equally
  // close candidates, the one more of the directory uses is the better guess.
  private vocab = new Map<string, number>();
  private phonIndex = new Map<string, string[]>();

  private async buildVocab(): Promise<void> {
    try {
      const rows = await this.listings.find(
        { status: 'approved', active: { $ne: false } },
        { title: 1, search_blob: 1, categories: 1, job_role: 1 },
      ).lean();
      const freq = new Map<string, number>();
      for (const r of rows) {
        const text = [
          (r as any).title, (r as any).search_blob, (r as any).job_role,
          ...((r as any).categories || []),
        ].join(' ').toLowerCase();
        for (const w of text.split(/[^a-z0-9]+/)) {
          if (w.length < 3 || w.length > 24 || /^\d+$/.test(w)) continue;
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }
      const phon = new Map<string, string[]>();
      for (const w of freq.keys()) {
        const k = phoneticKey(w);
        if (!k) continue;
        const arr = phon.get(k);
        if (arr) arr.push(w); else phon.set(k, [w]);
      }
      this.vocab = freq;
      this.phonIndex = phon;
    } catch { /* keep the previous vocabulary */ }
  }

  // Best in-vocabulary word for a token, or null to leave it alone.
  private bestWord(token: string): string | null {
    if (this.vocab.has(token)) return null;                 // already a real word
    const max = allowedEdits(token.length);
    if (!max) return null;
    let best: string | null = null, bestD = max + 1, bestF = -1;
    for (const [w, f] of this.vocab) {
      if (Math.abs(w.length - token.length) > max && w.length <= token.length) continue;
      let d = editDistance(token, w, max);
      // The visitor may still be mid-word ("patha" → "pathology"): compare
      // against the same-length PREFIX of the candidate too.
      if (d > max && w.length > token.length) d = editDistance(token, w.slice(0, token.length), max);
      if (d > max) continue;
      if (d < bestD || (d === bestD && f > bestF)) { best = w; bestD = d; bestF = f; }
    }
    if (best) return best;
    // Nothing close letter-by-letter — try how it SOUNDS. Catches names whose
    // English spelling legitimately varies rather than being mistyped.
    const cands = this.phonIndex.get(phoneticKey(token));
    if (cands?.length) return cands.reduce((a, b) => ((this.vocab.get(b) || 0) > (this.vocab.get(a) || 0) ? b : a));
    return null;
  }

  // Correct a whole query. Returns null when nothing could be improved, so the
  // caller can tell "no suggestion" apart from "same query back".
  private correctQuery(q: string, city?: string): string | null {
    if (!this.vocab.size) return null;
    const cityN = norm(city || '');
    let changed = false;
    const out = String(q).toLowerCase().split(/\s+/).filter(Boolean).map((raw) => {
      const t = norm(raw);
      if (!t || t.length < 3 || STOPWORDS.has(t) || t === cityN) return raw;
      const fix = this.bestWord(t);
      if (fix && fix !== t) { changed = true; return fix; }
      return raw;
    });
    return changed ? out.join(' ') : null;
  }

  // Build a unique slug. Readable from the title normally; RANDOM when `hidden`
  // (so a masked name never appears in the URL). Appends _2, _3… on collision;
  // excludes one id so a listing can keep its own slug on re-check.
  private async uniqueSlug(title: string, excludeId?: string, hidden = false): Promise<string> {
    const base = hidden ? randomSlug() : slugifyTitle(title);
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('^' + esc + '(_\\d+)?$', 'i');
    const rows = await this.listings.find({ slug: rx }, { slug: 1 }).lean();
    const taken = new Set(
      rows
        .filter((r) => !excludeId || String(r._id) !== String(excludeId))
        .map((r) => String((r as any).slug).toLowerCase()),
    );
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
      const c = `${base}_${i}`;
      if (!taken.has(c.toLowerCase())) return c;
    }
  }

  // ---- Home section sequence (admin-ordered) ----
  private static KIND_META: Record<string, { label: string; emoji: string }> = {
    job_opening: { label: 'Job Openings', emoji: '💼' },
    job_seeker: { label: 'Job Seekers', emoji: '🙋' },
    happening: { label: 'Happenings', emoji: '🎉' },
  };
  // post_type-based sections (sell/other are kind=business but category-less, so
  // they'd never show in a category section — give them their own section).
  private static PTYPE_META: Record<string, { label: string; emoji: string }> = {
    sell: { label: 'Sell / Rent', emoji: '🏷️' },        // legacy combined (still resolvable)
    other: { label: 'Other Listings', emoji: '📦' },
  };
  // Sell/Rent split into their OWN sections (post_type=sell + sale_or_rent=key).
  private static SALE_META: Record<string, { label: string; emoji: string }> = {
    sale: { label: 'Sell — Used Items', emoji: '🏷️' },
    rent: { label: 'Rent', emoji: '🔑' },
  };
  // Special (non-listing) sections rendered by their own frontend component but
  // orderable in Home Order like any other section.
  private static SPECIAL_META: Record<string, { label: string; emoji: string }> = {
    complaints: { label: 'Ward Complaints', emoji: '🏛️' },
  };
  // Describe a section id ("kind:job_opening" | "cat:grocery" | "sale:sale" | "ptype:other").
  private describeSection(id: string): { id: string; type: string; key: string; label: string; emoji: string } | null {
    const [type, key] = id.split(':');
    if (type === 'kind') {
      const m = ListingsService.KIND_META[key]; if (!m) return null;
      return { id, type, key, label: m.label, emoji: m.emoji };
    }
    if (type === 'sale') {
      const m = ListingsService.SALE_META[key]; if (!m) return null;
      return { id, type, key, label: m.label, emoji: m.emoji };
    }
    if (type === 'special') {
      const m = ListingsService.SPECIAL_META[key]; if (!m) return null;
      return { id, type, key, label: m.label, emoji: m.emoji };
    }
    if (type === 'ptype') {
      const m = ListingsService.PTYPE_META[key]; if (!m) return null;
      return { id, type, key, label: m.label, emoji: m.emoji };
    }
    if (type === 'cat') {
      const c = CATEGORY_BY_KEY[key]; if (!c) return null;
      return { id, type, key, label: c.label, emoji: c.emoji };
    }
    return null;
  }
  async getHomeSequence(): Promise<string[]> {
    const c = await this.config.findOne({ key: 'home_sequence' }).lean();
    const saved = (c?.value as string[]) || [];
    // Merge defaults so newly-added categories appear (at the end) automatically.
    const def = defaultHomeSequence();
    const merged = [...saved.filter((s) => def.includes(s)), ...def.filter((s) => !saved.includes(s))];
    return merged.length ? merged : def;
  }
  async setHomeSequence(seq: string[]): Promise<{ ok: true }> {
    const valid = (Array.isArray(seq) ? seq : []).filter((s) => !!this.describeSection(s));
    await this.config.findOneAndUpdate({ key: 'home_sequence' }, { value: valid }, { upsert: true });
    return { ok: true };
  }

  // ---- Login gate (admin Settings) -----------------------------------------
  // Thresholds enforced on contact reveals:
  //   time_limit_minutes  — cumulative app time before login (client-side, 0=off)
  //   contact_limit       — free DISTINCT contacts for an anon device before
  //                         login is mandatory (server-side, 0=off)
  //   daily_contact_limit — max distinct contacts per DAY for anyone, resets at
  //                         12am IST (server-side, 0=off)
  // Stored in app_config 'login_gate'.
  private gateNum(x: any, d: number): number {
    const n = Math.floor(Number(x));
    return Number.isFinite(n) && n >= 0 ? n : d;
  }
  async getLoginGate(): Promise<{ time_limit_minutes: number; contact_limit: number; daily_contact_limit: number }> {
    const now = Date.now();
    if (gateCache && now - gateCache.at < 60_000) return gateCache.val;
    const c = await this.config.findOne({ key: 'login_gate' }).lean();
    const v: any = c?.value || {};
    const val = {
      time_limit_minutes: this.gateNum(v.time_limit_minutes, Number(process.env.GATE_TIME_MIN) || 30),
      contact_limit: this.gateNum(v.contact_limit, ANON_LIMIT),
      daily_contact_limit: this.gateNum(v.daily_contact_limit, DAILY_LIMIT),
    };
    gateCache = { at: now, val };
    return val;
  }
  async setLoginGate(input: { time_limit_minutes?: any; contact_limit?: any; daily_contact_limit?: any }) {
    // MERGE with current — a caller that sends only some fields (e.g. the older
    // Settings page) must not reset the others to their defaults.
    const cur = await this.getLoginGate();
    const pick = (x: any, d: number) => (x === undefined || x === null || x === '' ? d : this.gateNum(x, d));
    const val = {
      time_limit_minutes: pick(input?.time_limit_minutes, cur.time_limit_minutes),
      contact_limit: pick(input?.contact_limit, cur.contact_limit),
      daily_contact_limit: pick(input?.daily_contact_limit, cur.daily_contact_limit),
    };
    await this.config.findOneAndUpdate({ key: 'login_gate' }, { value: val }, { upsert: true });
    gateCache = null;   // invalidate so the next reveal/read sees the new value
    return val;
  }
  // All available sections + the current order — for the admin reorder screen.
  async homeSequenceAdmin() {
    const sequence = await this.getHomeSequence();
    return { sequence: sequence.map((id) => this.describeSection(id)).filter(Boolean) };
  }
  // Home page payload: each ordered section with its top listings (skips empty).
  async homeSections(city?: string): Promise<any[]> {
    const sequence = await this.getHomeSequence();
    const base: any = { status: 'approved', active: { $ne: false } };
    if (city) base.city = new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    // NOTE: `views` is kept in (needed for balanced ranking); toPublic strips it.
    const proj = { mobile: 0, alt_phone: 0, whatsapp: 0, search_blob: 0, search_norm: 0,
      keywords_cache: 0, posted_by_mobile: 0, posted_by_user_id: 0, approved_by: 0, approved_at: 0, source: 0 };

    const out: any[] = [];
    for (const id of sequence) {
      const d = this.describeSection(id);
      if (!d) continue;
      // Special sections (e.g. Ward Complaints) carry no listings — emit a marker
      // at their sequence position; the frontend renders them with its own row.
      if (d.type === 'special') { out.push({ ...d, total: 0, items: [] }); continue; }
      const f = { ...base };
      if (d.type === 'kind') f.kind = d.key;
      // sale = "for sale" = every sell listing that ISN'T rent (covers legacy
      // rows saved with sale_or_rent '' instead of 'sale'); rent = explicit.
      else if (d.type === 'sale') { f.post_type = 'sell'; f.sale_or_rent = d.key === 'rent' ? 'rent' : { $ne: 'rent' }; }
      else if (d.type === 'ptype') f.post_type = d.key;        // other (legacy sell)
      else { f.kind = 'business'; f.categories = d.label; }   // array contains label
      const [pool, total] = await Promise.all([
        this.listings.find(f, proj).sort({ createdAt: -1 }).limit(RANK_POOL_CAP).lean(),
        this.listings.countDocuments(f),
      ]);
      if (!pool.length) continue;              // hide empty sections
      // Kind-aware ranking (transactional = freshness+rotation, evergreen keeps
      // popularity, upcoming events first, past events dropped), top 10.
      const ranked = rankBalanced(pool);
      if (!ranked.length) continue;            // e.g. a happening section of only past events
      // Subtract any events we dropped from the pool so the count doesn't overstate.
      const shownTotal = Math.max(total - (pool.length - ranked.length), ranked.length);
      out.push({ ...d, total: shownTotal, items: ranked.slice(0, 10).map(toPublic) });
      if (out.length >= 30) break;             // safety cap
    }
    return out;
  }

  async create(dto: CreateListingDto, ctx: PostContext) {
    const isAdmin = ctx.role === 'admin';
    // Restricted users can't post (admins never restricted).
    if (!isAdmin && await this.auth.isBlocked(ctx.userId)) {
      throw new ForbiddenException('Your account is restricted. Contact support.');
    }
    // A post needs SOME way to be contacted, but it doesn't have to be a call
    // number — WhatsApp-only is fine. The number that actually goes public is
    // the one we verify below.
    if (!dto.mobile && !dto.whatsapp) {
      throw new BadRequestException('Add a call or WhatsApp number.');
    }
    const contactMobile = AuthService.normalizeMobile((dto.mobile || dto.whatsapp) as string);

    // Contact-number ownership: a logged-in poster may use ANY contact number
    // without per-number OTP (product decision). Creating already requires a
    // valid session (JwtAuthGuard), and `posted_by_mobile`/`posted_by_user_id`
    // keep the real author on the record for accountability. The old
    // mobile_token / NUMBER_VERIFY_REQUIRED gate is intentionally removed.

    const kind = postTypeToKind(dto.post_type as PostType);
    const geo = await this.pins.resolve(dto.pincode);

    const isJob = kind === 'job_opening' || kind === 'job_seeker';
    let keywordsCache: string[];
    let freeStore: string[];
    let blobParts: string[];
    let cats: string[] = [];   // business categories (≤3); empty for jobs

    if (isJob) {
      // Jobs don't ask the user for keywords — they carry default job keywords
      // (bilingual) plus the role, so generic "job/naukri" AND role searches work.
      const role = (dto.job_role || '').trim();
      if (!role) throw new BadRequestException('Job role is required.');
      const extra = kind === 'job_opening' ? JOB_HIRING_KEYWORDS : JOB_SEEKER_KEYWORDS;
      keywordsCache = [role];                       // display = the role
      freeStore = [];
      // Jobs also pick a role CATEGORY (e.g. "Cook", "House Help") — store it and
      // fold ALL its synonyms into the blob so a search for "maid"/"बाई"/"house
      // help" finds a seeker who picked House Help (same idea as the business branch).
      cats = normalizeCategories(dto.categories, dto.category);
      const catSyn = cats.flatMap((c) => CATEGORY_BY_LABEL[c]?.synonyms || []);
      // Privacy: a hidden name must NOT be searchable (else typing the name
      // confirms the person). Drop the title from the blob when hide_title is on;
      // the seeker stays findable by role/skills/category, never by their name.
      const jobTitle = dto.hide_title ? '' : dto.title;
      blobParts = [
        role, role, jobTitle,
        ...JOB_BASE_KEYWORDS, ...extra,
        blobClip(dto.description), blobClip(dto.experience_description),
        ...catSyn,
      ];
    } else {
      // Keywords = dictionary tags + free-typed keywords. At least one; max 25.
      const tagIds = dto.tag_ids || [];
      const free = (dto.free_keywords || []).map((s) => s.trim()).filter(Boolean);
      const tags = tagIds.length ? await this.tagsSvc.byIds(tagIds) : [];
      const names = tags.map((t: any) => t.name);
      const allKeywords = [...names, ...free];
      if (allKeywords.length < 1) throw new BadRequestException('Add at least one keyword.');
      if (tagIds.length + free.length > 25) throw new BadRequestException('Maximum 25 keywords.');
      keywordsCache = allKeywords;
      freeStore = free;
      // Up to 3 equal categories; fold ALL their synonyms into the blob so the
      // listing is findable by everyday words for each ("daily needs"→grocery).
      cats = normalizeCategories(dto.categories, dto.category);
      const catSyn = cats.flatMap((c) => CATEGORY_BY_LABEL[c]?.synonyms || []);
      // Privacy: hidden name → keep it out of search (findable by keywords only).
      const bizTitle = dto.hide_title ? '' : dto.title;
      blobParts = [
        bizTitle, bizTitle,
        ...names, ...names,
        ...tags.flatMap((t: any) => t.synonyms || []),
        ...free,
        dto.short_desc || '',
        blobClip(dto.description),
        ...catSyn,
      ];
    }

    const { mobile_token, ...fields } = dto as any;
    const payload: any = {
      ...fields,
      kind,
      slug: await this.uniqueSlug(dto.title, undefined, !!dto.hide_title),
      week_hours: cleanWeek(dto.week_hours),
      free_keywords: freeStore,
      has_phone: Boolean(dto.mobile || dto.whatsapp || dto.alt_phone),
      // A channel is only ON if the poster asked for it AND a number backs it.
      // Settled once, here, so every reader can just trust the stored booleans.
      call_ok: dto.call_ok !== false && Boolean(dto.alt_phone || dto.mobile),
      whatsapp_ok: dto.whatsapp_ok !== false && Boolean(dto.whatsapp || dto.mobile),
      city: geo?.city || '',
      district: geo?.district || '',
      state: geo?.state || '',
      keywords_cache: keywordsCache,
      category: cats[0] || '',
      categories: cats,
      search_blob: blobParts.join(' ').toLowerCase(),
      search_norm: norm(blobParts.join(' ')),
      // Admin posts publish immediately (no approval queue); user posts wait.
      status: isAdmin ? 'approved' : 'pending',
      approved_by: isAdmin ? ctx.userId : undefined,
      approved_at: isAdmin ? new Date() : undefined,
      // audit
      posted_by_user_id: ctx.userId,
      posted_by_mobile: isAdmin ? '' : AuthService.normalizeMobile(ctx.userMobile),
      source: isAdmin ? 'admin' : 'web',
    };
    // Retry on the (rare) slug unique-index race: recompute and try again.
    let doc;
    for (let attempt = 0; ; attempt++) {
      try { doc = await this.listings.create(payload); break; }
      catch (e: any) {
        if (e?.code === 11000 && attempt < 3) { payload.slug = await this.uniqueSlug(dto.title, undefined, !!dto.hide_title); continue; }
        throw e;
      }
    }
    // Admin posts publish immediately → warm the share card now.
    if (doc.status === 'approved') this.warmOgCard(String(doc._id));
    return { _id: String(doc._id), status: doc.status };
  }

  // ===== FAIR VISIBILITY =====
  // Prime slots (first row, 3 spots) are rotated so every post gets a turn,
  // instead of the same few always sitting on top. Points: 3/2/1 for pos 1/2/3;
  // nothing below. Scores are summed over a ROLLING 30 DAYS so a post added later
  // isn't facing an all-time backlog it can never clear.
  private async visScores(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!ids.length) return out;
    const cutoff = new Date(Date.now() + 5.5 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
    try {
      const rows: any[] = await this.vis.aggregate([
        { $match: { day: { $gte: cutoff } } },
        { $unwind: '$picks' },
        { $match: { 'picks.listing_id': { $in: ids } } },
        { $group: { _id: '$picks.listing_id', pts: { $sum: '$picks.points' } } },
      ]);
      for (const r of rows) out.set(String(r._id), r.pts);
    } catch { /* fairness is best-effort — never break search */ }
    return out;
  }

  // Quality floor: prime real estate is the shopfront, so a blank listing doesn't
  // get rotated into it. It still ranks normally below.
  private static rotationOk(d: any): boolean {
    return !!(d?.photos?.length || d?.short_desc || d?.description);
  }

  // Pin the first row for this visitor+day+pool and award the points.
  // If we already assigned slots for them today, REPLAY that assignment so their
  // first row doesn't reshuffle mid-day as other people browse (stability).
  private async fairFirstRow(rows: any[], vid: string, pool: string, mode: 'browse' | 'search'): Promise<any[]> {
    // A pin is a deliberate admin decision — the rotation must never push it out
    // of the first row. Hold pinned rows aside, rotate the rest, then restore
    // them on top. (They also don't consume rotation slots, so fairness for
    // everyone else is measured on the posts that actually compete.)
    const pins = rows.filter((d) => d?.pinned);
    if (pins.length) {
      const rest = rows.filter((d) => !d?.pinned);
      return [...pins, ...(await this.fairFirstRow(rest, vid, pool, mode))];
    }
    if (rows.length < 2) return rows;
    const day = istDay();
    const byId = new Map(rows.map((d) => [String(d._id), d]));
    const front = (picked: any[]) => {
      const ids = new Set(picked.map((d) => String(d._id)));
      return [...picked, ...rows.filter((d) => !ids.has(String(d._id)))];
    };
    try {
      const prev: any = await this.vis.findOne({ visitor_id: vid, day, pool }).lean();
      if (prev?.picks?.length) {
        const replay = [...prev.picks].sort((a: any, b: any) => a.pos - b.pos)
          .map((p: any) => byId.get(String(p.listing_id))).filter(Boolean);
        if (replay.length) return front(replay);
      }
    } catch { return rows; }

    // First view today: choose the first row.
    //  • browse  → the 3 LEAST-VISIBLE eligible posts are promoted to the top.
    //  • search  → relevance already decided the order (visibility only broke ties
    //    inside a coverage bucket), so we simply award whoever is on top.
    let picks: any[];
    if (mode === 'search') {
      picks = rows.slice(0, 3);
    } else {
      const cand = rows.slice(0, 60).filter(ListingsService.rotationOk);
      const scores = await this.visScores(cand.map((d) => String(d._id)));
      picks = [...cand].sort((a, b) =>
        (scores.get(String(a._id)) || 0) - (scores.get(String(b._id)) || 0)).slice(0, 3);
    }
    if (!picks.length) return rows;
    const rec = {
      visitor_id: vid, day, pool, ts: new Date(),
      picks: picks.map((d, i) => ({ listing_id: String(d._id), pos: i + 1, points: 3 - i })),
    };
    // upsert + $setOnInsert = one assignment per visitor/day/pool, so refreshing
    // can never keep inflating the same post's visibility.
    this.vis.updateOne({ visitor_id: vid, day, pool }, { $setOnInsert: rec }, { upsert: true })
      .catch(() => { /* best effort */ });
    return mode === 'search' ? rows : front(picks);
  }

  // Public search — approved only, projected, paginated. No bulk dump.
  async search(opts: {
    q?: string; city?: string; kind?: string; category?: string; post_type?: string; sale_or_rent?: string; page?: number;
    vid?: string; bot?: boolean;                    // fair-visibility rotation
    gender?: string; ageMin?: number; ageMax?: number;
    expMin?: number; expMax?: number; salMin?: number; salMax?: number;
    noCorrect?: boolean;                            // set on the retry — never recurse twice
  }): Promise<any> {
    const page = Math.max(1, opts.page || 1);
    const filter: any = { status: 'approved', active: { $ne: false } };
    if (opts.city) filter.city = new RegExp('^' + opts.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    if (opts.kind) filter.kind = opts.kind;
    if (opts.post_type) filter.post_type = opts.post_type;   // sell / other browse
    // sale = not-rent (incl. legacy '' rows); rent = explicit.
    if (opts.sale_or_rent === 'rent') filter.sale_or_rent = 'rent';
    else if (opts.sale_or_rent === 'sale') filter.sale_or_rent = { $ne: 'rent' };
    // Filter by the listing's assigned category — EXACT label match, not a keyword
    // blob match, so a listing only surfaces under its real category (the rail is
    // data-driven from these same labels). NB: labels themselves contain commas
    // ("TV, Fridge & Appliances (Used)") and slashes, so do NOT split the value.
    if (opts.category) filter.categories = opts.category;

    // ---- job filters (seekers / employers) ----
    if (opts.gender) {
      if (opts.kind === 'job_opening') filter.gender_required = opts.gender;
      else filter.gender = opts.gender;
    }
    // Age range → dob bounds (dob is "YYYY-MM-DD"; ISO strings sort lexically).
    if (opts.ageMin != null || opts.ageMax != null) {
      const dob: any = {};
      if (opts.ageMax != null) dob.$gte = dobFromAge(opts.ageMax + 1);  // older bound
      if (opts.ageMin != null) dob.$lte = dobFromAge(opts.ageMin);      // younger bound
      filter.dob = dob;
    }
    const expField = opts.kind === 'job_opening' ? 'experience_required_months' : 'experience_months';
    if (opts.expMin != null || opts.expMax != null) {
      filter[expField] = {};
      if (opts.expMin != null) filter[expField].$gte = opts.expMin;
      if (opts.expMax != null) filter[expField].$lte = opts.expMax;
    }
    if (opts.kind === 'job_opening') {
      if (opts.salMin != null) filter.salary_max = { $gte: opts.salMin };   // pays at least this
      if (opts.salMax != null) filter.salary_min = { ...(filter.salary_min || {}), $lte: opts.salMax };
    }

    // PII never leaves the server — but the boundary is toPublic, not the query.
    // dob/search_blob/views/source/mobile/whatsapp are all fetched because
    // something downstream derives from them (age, ranking, the self-posted
    // tie-break, and the call_ok/whatsapp_ok channel flags), then toPublic
    // strips every one of them from the response.
    const pii = {
      posted_by_mobile: 0, posted_by_user_id: 0, approved_by: 0, approved_at: 0,
    };

    // ---- Ranked path (a text query). Normalized SUBSTRING match so partial &
    // glued queries work ("paper"→paperboat, "tooyums"→too+yums). We match docs
    // that hit ANY meaningful token (OR), then rank by COVERAGE (how many tokens
    // matched) — so a natural query like "fmcg distributors in gondia" finds a
    // listing with fmcg+distributor even though "in"/"gondia" are dropped and
    // "distributors"→"distributor". Then tie-break by field score → views →
    // recency.
    const groups = opts.q ? queryGroups(opts.q, opts.city) : [];
    if (opts.q) {
      if (groups.length) {
        // OR across every variant of every token.
        filter.$or = groups.flatMap((g) => g.map((v) => ({ search_norm: { $regex: escapeRe(v) } })));
      }
      const CANDIDATE_CAP = 200;
      const candidates = await this.listings
        .find(filter, pii)
        .sort({ views: -1, updatedAt: -1 })
        .limit(CANDIDATE_CAP)
        .lean();

      // FAIRNESS: visibility breaks ties INSIDE a coverage bucket. Relevance tiers
      // are never crossed — a weaker match can rise within its own group, never
      // above a better-matching one. It replaces the old `views` tie-break, which
      // rewarded the already-popular (rich-get-richer).
      const scored = candidates
        .map((d) => ({ d, r: relevance(d, groups, String(opts.q)) }))
        .filter((x) => groups.length === 0 || x.r.coverage > 0); // must match ≥1 token
      const vmap = opts.vid ? await this.visScores(scored.map((x) => String(x.d._id))) : new Map<string, number>();
      const ranked = scored
        .sort((a, b) =>
          b.r.coverage - a.r.coverage ||          // 1) match more query tokens (the BUCKET) — relevance is prior
          Number(!!(b.d as any).pinned) - Number(!!(a.d as any).pinned) ||       // 2) admin pin, inside the bucket
          Number(isSelfPosted(b.d)) - Number(isSelfPosted(a.d)) ||               // 3) posted by the owner beats admin-keyed
          (vmap.get(String(a.d._id)) || 0) - (vmap.get(String(b.d._id)) || 0) || // 4) least-seen first, within bucket
          b.r.score - a.r.score ||                 // 5) better placement (title>kw>…)
          new Date((b.d as any).updatedAt || 0).getTime() - new Date((a.d as any).updatedAt || 0).getTime(), // 6) newest
        )
        .map((x) => x.d);

      // Nothing matched. Before giving up, see whether the query is simply
      // misspelled — "jib" for job, "gindia" for gondia — and if a correction
      // finds something, return THAT with a note so the UI can say what it did.
      // Only from page 1, and never more than one hop (noCorrect on the retry).
      if (!ranked.length && !opts.noCorrect && page === 1) {
        const fixed = this.correctQuery(String(opts.q), opts.city);
        if (fixed && norm(fixed) !== norm(String(opts.q))) {
          const retry = await this.search({ ...opts, q: fixed, noCorrect: true });
          if (retry.results?.length) return { ...retry, corrected: fixed, original: opts.q };
        }
      }

      const total = ranked.length;
      let pageRows = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      // Award the first row (page 1 only) — order is untouched here, relevance rules.
      if (page === 1 && opts.vid && !opts.bot) {
        pageRows = await this.fairFirstRow(pageRows, opts.vid, `q:${norm(String(opts.q))}`, 'search');
      }
      return { page, page_size: PAGE_SIZE, total, results: pageRows.map(toPublic) };
    }

    // ---- Browse path (no query): KIND-AWARE ranking. Transactional kinds
    // (seeker/opening/sell/news) rank by freshness + rotation (no popularity),
    // upcoming events headline + past events drop out, evergreen keeps
    // popularity. Rank a capped candidate pool in memory, then paginate.
    const projection = { ...pii, search_blob: 0 };
    const [pool, total] = await Promise.all([
      this.listings.find(filter, projection).sort({ createdAt: -1 }).limit(RANK_POOL_CAP).lean(),
      this.listings.countDocuments(filter),
    ]);
    const ranked = rankBalanced(pool);
    let rows = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    // FAIRNESS (category listing): promote the 3 least-seen eligible posts into
    // the first row. Page 1 only, and the promoted 3 are removed from the rest so
    // nothing appears twice on the same screen.
    if (page === 1 && opts.vid && !opts.bot) {
      const poolKey = `c:${opts.kind || ''}|${opts.post_type || ''}|${opts.sale_or_rent || ''}|${opts.category || ''}|${opts.city || ''}`;
      rows = await this.fairFirstRow(rows, opts.vid, poolKey, 'browse');
    }
    return {
      page,
      page_size: PAGE_SIZE,
      // Discount any finished events we dropped so the count matches what shows.
      total: Math.max(total - (pool.length - ranked.length), ranked.length),
      results: rows.map(toPublic),
    };
  }

  // Projection shared by the id- and slug-based public fetches. posted_by_user_id
  // IS fetched (to compute can_edit) but stripped by toPublic.
  // The phone fields are fetched too, and NOT because we send them — toPublic
  // destructures them out. They're what `call_ok` / `whatsapp_ok` are derived
  // from ("is there a number behind this channel?"). Projecting them away made
  // both flags read as false on every detail page, so the contact sheet offered
  // nothing but Copy. Strip at the toPublic boundary, never in the query.
  private static PUBLIC_PROJ = { search_blob: 0,
    posted_by_mobile: 0, approved_by: 0, approved_at: 0, source: 0 } as const;

  async getPublic(id: string, requesterId?: string) {
    const d = await this.listings.findOne({ _id: id }, ListingsService.PUBLIC_PROJ).lean();
    return this.finishPublic(d, requesterId);
  }

  // Same as getPublic but resolves the readable URL slug (case-insensitive).
  async getPublicBySlug(slug: string, requesterId?: string) {
    const rx = new RegExp('^' + String(slug).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const d = await this.listings.findOne({ slug: rx }, ListingsService.PUBLIC_PROJ).lean();
    return this.finishPublic(d, requesterId);
  }

  // Shared visibility check + view-count for the public detail fetches.
  private finishPublic(d: any, requesterId?: string) {
    if (!d) throw new NotFoundException('Listing not found');
    const can_edit = !!requesterId && String(d.posted_by_user_id) === String(requesterId);
    // Public visibility = approved + not hidden. The OWNER may still view their
    // own listing while it's pending/hidden (e.g. right after editing, so we can
    // send them back to its page); everyone else gets a 404 — no privacy change.
    const isPublic = d.status === 'approved' && d.active !== false;
    if (!isPublic && !can_edit) throw new NotFoundException('Listing not found');
    // Count genuine public views (not the owner previewing) for the popularity
    // signal. Fire-and-forget so it never slows the response.
    if (isPublic && !can_edit) this.listings.updateOne({ _id: d._id }, { $inc: { views: 1 } }).catch(() => {});
    return { ...toPublic(d), can_edit };
  }

  // Full doc for the owner (or admin) to edit.
  async getForEdit(id: string, userId: string, role: string): Promise<any> {
    const d = await this.listings.findById(id).lean();
    if (!d) throw new NotFoundException('Listing not found');
    if (role !== 'admin' && String((d as any).posted_by_user_id) !== String(userId)) {
      throw new ForbiddenException('Not your listing.');
    }
    return d;
  }

  // Owner (or admin) edit. Owner edits go back to pending for re-review.
  async updateOwned(id: string, userId: string, role: string, dto: any): Promise<{ _id: string }> {
    const existing = await this.listings.findById(id).lean();
    if (!existing) throw new NotFoundException('Listing not found');
    if (role !== 'admin' && String((existing as any).posted_by_user_id) !== String(userId)) {
      throw new ForbiddenException('Not your listing.');
    }
    await this.adminUpdate(id, dto);
    // Owner edits return to the pending queue → not publicly shareable until
    // re-approved, so drop the cached share card (re-minted on re-approval).
    if (role !== 'admin') { await this.listings.findByIdAndUpdate(id, { status: 'pending' }); this.removeOgCard(id); }
    return { _id: id };
  }

  // GATED phone reveal — the anti-scrape core.
  async reveal(id: string, visitorId: string, userId: string | null, ip: string) {
    const day = istDay();
    const gate = await this.getLoginGate();

    // DAILY cap — distinct contacts opened today (re-opening one already seen
    // today is free). Keyed to the account when logged in, else the device.
    // Resets at 12am IST. daily_contact_limit = 0 disables it.
    const dayScope: any = userId ? { user_id: userId, day } : { visitor_id: visitorId, day };
    const revealedToday = (await this.reveals.distinct('listing_id', dayScope)).map(String);
    const seenToday = revealedToday.includes(String(id));
    if (gate.daily_contact_limit > 0 && !seenToday && revealedToday.length >= gate.daily_contact_limit) {
      throw new HttpException(
        { code: 'DAILY_LIMIT', message: `Daily limit of ${gate.daily_contact_limit} contacts reached. Try again tomorrow.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ANONYMOUS lifetime cap — after contact_limit distinct contacts EVER (this
    // device), login is mandatory. Re-opening an already-seen posting is still
    // allowed — only a NEW posting beyond the cap is gated. 0 disables it.
    if (!userId && gate.contact_limit > 0) {
      const revealedEver = (await this.reveals.distinct('listing_id', { visitor_id: visitorId })).map(String);
      if (!revealedEver.includes(String(id)) && revealedEver.length >= gate.contact_limit) {
        throw new UnauthorizedException({
          code: 'LOGIN_REQUIRED',
          message: 'Please register (free) to view more contacts.',
        });
      }
    }

    const d = await this.listings.findOne({ _id: id, status: 'approved', active: { $ne: false } }).lean();
    if (!d) throw new NotFoundException('Listing not found');
    // Privacy: a hidden-number listing never discloses its contact, even if asked.
    if ((d as any).hide_number) throw new NotFoundException('Contact not available');

    await this.reveals.create({ visitor_id: visitorId, user_id: userId, listing_id: id, day, ts: new Date(), ip });

    const usedToday = revealedToday.length + (seenToday ? 0 : 1);
    // RESOLVE each channel to the number that actually serves it, so the client
    // never has to know about the fallbacks. `alt_phone`/`whatsapp` override the
    // main number for their own channel; blank means "use the main number".
    // A channel the poster switched off returns '' and gets no button.
    const main = String((d as any).mobile || '');
    const callNumber = (d as any).call_ok !== false ? String((d as any).alt_phone || main) : '';
    const waNumber = (d as any).whatsapp_ok !== false ? String((d as any).whatsapp || main) : '';
    return {
      mobile: callNumber,
      whatsapp: waNumber,
      call_ok: !!callNumber,
      whatsapp_ok: !!waNumber,
      remaining_today: gate.daily_contact_limit > 0 ? Math.max(0, gate.daily_contact_limit - usedToday) : 9999,
    };
  }

  // Report a listing — LOGIN REQUIRED (so every report has an accountable user).
  // One OPEN report per (user, listing): re-reporting updates the existing one.
  async report(listingId: string, reason: string, details: string, userId: string, mobile: string, ip: string) {
    const exists = await this.listings.exists({ _id: listingId });
    if (!exists) throw new NotFoundException('Listing not found');
    if (await this.auth.isBlocked(userId)) throw new ForbiddenException('Your account is restricted.');
    await this.reports.findOneAndUpdate(
      { listing_id: listingId, user_id: userId, status: 'open' },
      { $set: { reason, details, reporter_mobile: mobile, ip, status: 'open' } },
      { upsert: true },
    );
    return { ok: true };
  }

  // ---- admin ----
  async listPending() {
    return this.listings.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
  }
  async pendingCount(): Promise<{ count: number }> {
    return { count: await this.listings.countDocuments({ status: 'pending' }) };
  }

  // Admin "User View" browse — approved listings INCLUDING hidden ones, with
  // the `active` flag, projected like the public view (so admin sees user view).
  async adminBrowse(opts: { q?: string; city?: string; page?: number }) {
    const page = Math.max(1, opts.page || 1);
    const filter: any = { status: 'approved' };
    if (opts.city) filter.city = new RegExp('^' + opts.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    if (opts.q) filter.$text = { $search: opts.q };
    const projection = { mobile: 0, alt_phone: 0, whatsapp: 0, search_blob: 0 };
    const cursor = this.listings.find(filter, projection)
      .sort(opts.q ? { score: { $meta: 'textScore' } } : { updatedAt: -1 })
      .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    const [rows, total] = await Promise.all([cursor, this.listings.countDocuments(filter)]);
    return { page, page_size: PAGE_SIZE, total, results: rows.map(toPublic) };
  }

  async setActive(id: string, active: boolean): Promise<{ _id: string; active: boolean }> {
    const d = await this.listings.findByIdAndUpdate(id, { active }, { new: true }).lean();
    if (!d) throw new NotFoundException('Listing not found');
    if (active && (d as any).status === 'approved') this.warmOgCard(id); else this.removeOgCard(id);
    return { _id: id, active: (d as any).active };
  }

  // Admin pin/unpin. Pinning only reorders results the listing already belongs
  // in — it never makes it match a query or category it otherwise wouldn't.
  async setPinned(id: string, pinned: boolean): Promise<{ _id: string; pinned: boolean }> {
    const d = await this.listings.findByIdAndUpdate(id, { pinned }, { new: true }).lean();
    if (!d) throw new NotFoundException('Listing not found');
    return { _id: id, pinned: !!(d as any).pinned };
  }

  // A user's own listings (any status, incl. hidden) for the "My Posts" page.
  async mine(userId: string): Promise<any[]> {
    return this.listings.find({ posted_by_user_id: userId },
      { mobile: 0, alt_phone: 0, search_blob: 0, posted_by_user_id: 0 })
      .sort({ createdAt: -1 }).lean();
  }

  // ---- home feeds (Offers / New in Gondia) + skip-empty counts ------------
  private cityRx(city?: string) {
    return city ? new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') : undefined;
  }
  // Businesses running an active offer (offer_text set). Newest first; category-filterable.
  async offers(city?: string, category?: string) {
    const filter: any = { status: 'approved', active: { $ne: false }, kind: 'business', offer_text: { $nin: ['', null] } };
    const rx = this.cityRx(city); if (rx) filter.city = rx;
    if (category) filter.categories = category;
    const rows = await this.listings.find(filter).sort({ createdAt: -1 }).limit(60).lean();
    return { results: rows.map((r) => toPublic(r)) };
  }
  // "New in {city}" — the DISCOVERY front page, not a classifieds firehose:
  //  0) businesses/services + events/news ONLY — jobs and buy/sell/rent are
  //     transactional (own tiles + Trending), so they're excluded here.
  //  1) time-boxed to the last 48h (auto-widens for low-volume cities so it's
  //     never empty), 2) one card per poster (kills the daily repost flood),
  //  3) round-robin across verticals (business ↔ events) so one can't bury the
  //     other, 4) ranked by completeness (photo/details) + light engagement,
  //  5) the visitor's top vertical floated a notch. Capped at the latest 30.
  async recent(city?: string, topVertical?: string) {
    const base: any = { status: 'approved', active: { $ne: false } };
    const rx = this.cityRx(city); if (rx) base.city = rx;
    // Discovery only: keep business + happenings; drop jobs + buy/sell/rent.
    base.kind = { $nin: ['job_opening', 'job_seeker'] };
    base.post_type = { $nin: ['sell', 'other'] };
    // Candidate pool = newest ~300. `mobile` is fetched for dedupe (toPublic
    // strips it before anything leaves the server).
    const proj = { search_blob: 0, search_norm: 0, keywords_cache: 0, alt_phone: 0, whatsapp: 0 };
    const pool = await this.listings.find(base, proj).sort({ createdAt: -1 }).limit(300).lean();
    if (!pool.length) return { results: [] };

    // 1) One card per BUSINESS — dedup by the listing's OWN contact number, not
    //    the poster. An admin who bulk-adds many different businesses shares one
    //    poster id, so poster-dedup would collapse the whole directory to one
    //    card; a single business reposting its own number still shows once.
    const seen = new Set<string>();
    const deduped = pool.filter((d: any) => {
      const key = String(d.mobile || d.posted_by_mobile || d._id);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    // 2) Freshness window: prefer the last 48h; fall back to the rest if that's
    //    too thin, so a quiet town still shows a full feed.
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const ts = (d: any) => new Date(d.createdAt || d.updatedAt || 0).getTime();
    const fresh = deduped.filter((d) => ts(d) >= cutoff);
    const chosen = fresh.length >= 15 ? fresh : deduped;

    // 3) Quality: completeness first, light engagement.
    const quality = (d: any) => {
      let q = 0;
      if (d.photos?.length) q += 3;
      if (d.description || d.short_desc) q += 1;
      if (d.category || d.categories?.length || d.kind !== 'business') q += 1;
      return q + Math.min((d.views || 0) / 50, 2);
    };

    // 4) Group by vertical; order each group by quality then recency.
    const groups = new Map<string, any[]>();
    for (const d of chosen) {
      const v = listingVertical(d);
      let arr = groups.get(v); if (!arr) { arr = []; groups.set(v, arr); }
      arr.push(d);
    }
    for (const arr of groups.values()) arr.sort((a, b) => quality(b) - quality(a) || ts(b) - ts(a));

    // 5) Round-robin across verticals (visitor's top vertical goes first each
    //    round) → variety, with a gentle personal lean. Capped at the latest 30.
    const order = [...groups.keys()].sort((a, b) => (a === topVertical ? -1 : b === topVertical ? 1 : 0));
    const out: any[] = [];
    let more = true;
    while (more && out.length < 30) {
      more = false;
      for (const v of order) {
        const arr = groups.get(v)!;
        if (arr.length) { out.push(arr.shift()); more = true; if (out.length >= 30) break; }
      }
    }
    return { results: out.map((d) => toPublic(d)) };
  }
  // Distinct categories actually PRESENT in a bucket, with counts — drives the
  // data-driven category rail (so the left panel shows Marketing/PR, Veterinary,
  // NGO… the real categories, not a hardcoded keyword list). Approved + active +
  // in-city; empty categories dropped; busiest first.
  async categoryBreakdown(city?: string, kind?: string, postType?: string, saleOrRent?: string, excludeSell?: boolean): Promise<{ results: { key: string; count: number }[] }> {
    const match: any = { status: 'approved', active: { $ne: false } };
    const rx = this.cityRx(city); if (rx) match.city = rx;
    if (kind) match.kind = kind;
    if (postType) match.post_type = postType;
    // Business bucket: some sell items are mis-tagged kind=business, so their
    // used-goods categories (e.g. "TV, Fridge & Appliances (Used)") leaked into
    // Business. Drop sell/other post-types — they belong in Buy-sell-rent.
    else if (excludeSell) match.post_type = { $nin: ['sell', 'other'] };
    if (saleOrRent === 'rent') match.sale_or_rent = 'rent';
    else if (saleOrRent === 'sale') match.sale_or_rent = { $ne: 'rent' };
    const rows = await this.listings.aggregate([
      { $match: match },
      // Each listing's assigned categories (fall back to the singular field), then
      // one row per category so a listing tagged with 3 shows under all 3.
      { $project: { cats: { $cond: [{ $gt: [{ $size: { $ifNull: ['$categories', []] } }, 0] }, '$categories', { $cond: [{ $ifNull: ['$category', false] }, ['$category'], []] }] } } },
      { $unwind: '$cats' },
      { $group: { _id: '$cats', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return { results: rows.filter((r: any) => r._id).map((r: any) => ({ key: String(r._id), count: r.count })) };
  }

  // Which home verticals actually have content (drives the skip-empty tiles).
  async verticalCounts(city?: string) {
    const base: any = { status: 'approved', active: { $ne: false } };
    const rx = this.cityRx(city); if (rx) base.city = rx;
    const [business, sell, rent, jobOpening, jobSeeker, happening, offers] = await Promise.all([
      this.listings.countDocuments({ ...base, kind: 'business' }),
      this.listings.countDocuments({ ...base, post_type: 'sell', sale_or_rent: { $ne: 'rent' } }),
      this.listings.countDocuments({ ...base, sale_or_rent: 'rent' }),
      this.listings.countDocuments({ ...base, kind: 'job_opening' }),
      this.listings.countDocuments({ ...base, kind: 'job_seeker' }),
      this.listings.countDocuments({ ...base, kind: 'happening' }),
      this.listings.countDocuments({ ...base, kind: 'business', offer_text: { $nin: ['', null] } }),
    ]);
    return { business, sell, rent, jobs: jobOpening + jobSeeker, happening, offers };
  }

  // As the poster types the contact number, find existing postings with the SAME
  // number + SAME kind that the requester may edit (their own; admin → all), so
  // the form can warn about a likely duplicate and deep-link to editing it.
  // Scoped to the caller's own postings ⇒ a number can't be used to enumerate
  // others' listings. Returns up to 10 (title masked per hide_title).
  async checkDuplicate(mobile: string, kind: string, excludeId: string | undefined, requester: { id: string; role: string }) {
    const m = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(m) || !kind) return { results: [] };
    const filter: any = { mobile: m, kind };
    if (excludeId) filter._id = { $ne: excludeId };
    if (requester?.role !== 'admin') filter.posted_by_user_id = requester?.id;   // own only
    const rows = await this.listings
      .find(filter, { title: 1, hide_title: 1, kind: 1, category: 1, status: 1, slug: 1, createdAt: 1 })
      .sort({ createdAt: -1 }).limit(10).lean();
    return {
      results: rows.map((r: any) => ({
        id: String(r._id),
        title: maskTitle(r.title, r.hide_title),
        kind: r.kind || null,
        category: r.category || null,
        status: r.status,
      })),
    };
  }

  // Toggle active on a listing the caller owns (admin may toggle any).
  async setActiveOwned(id: string, userId: string, role: string, active: boolean) {
    const d = await this.listings.findById(id).lean();
    if (!d) throw new NotFoundException('Listing not found');
    if (role !== 'admin' && String((d as any).posted_by_user_id) !== String(userId)) {
      throw new ForbiddenException('Not your listing.');
    }
    await this.listings.findByIdAndUpdate(id, { active });
    if (active && (d as any).status === 'approved') this.warmOgCard(id); else this.removeOgCard(id);
    return { _id: id, active };
  }

  // Full document (incl. phone, dob, metadata) for the admin view/edit page.
  async getAdmin(id: string): Promise<any> {
    const d = await this.listings.findById(id).lean();
    if (!d) throw new NotFoundException('Listing not found');
    return d;
  }

  // Admin edit. Applies provided fields, re-derives geo (if pincode changed)
  // and the search index (title/keywords/role/description), then saves.
  async adminUpdate(id: string, dto: any): Promise<{ _id: string }> {
    const existing = await this.listings.findById(id).lean();
    if (!existing) throw new NotFoundException('Listing not found');

    const patch: any = { ...dto };
    if (dto.week_hours !== undefined) patch.week_hours = cleanWeek(dto.week_hours);
    const merged: any = { ...existing, ...dto };
    const kind = dto.post_type ? postTypeToKind(dto.post_type) : existing.kind;
    patch.kind = kind;

    if (dto.pincode && dto.pincode !== existing.pincode) {
      const geo = await this.pins.resolve(dto.pincode);
      patch.city = geo?.city || ''; patch.district = geo?.district || ''; patch.state = geo?.state || '';
    }
    // Same rule on edit: clearing the call number is fine as long as WhatsApp
    // remains (and vice versa) — but a post can't end up with neither.
    if (dto.mobile !== undefined || dto.whatsapp !== undefined) {
      if (!merged.mobile && !merged.whatsapp) throw new BadRequestException('Add a call or WhatsApp number.');
      patch.has_phone = Boolean(merged.mobile || merged.whatsapp);
    }

    // Slug is a STABLE permalink: keep the original so shared links never rot
    // even if the title is edited. Mint one for a legacy row that lacks it — and
    // RE-mint a random one if the name is hidden but the slug still leaks it.
    const hidden = !!merged.hide_title;
    const leaks = hidden && !!existing.slug
      && new RegExp('^' + escapeRe(slugifyTitle(merged.title || '')) + '(_\\d+)?$', 'i').test(String(existing.slug))
      && !!slugifyTitle(merged.title || '');
    if (!existing.slug || leaks) patch.slug = await this.uniqueSlug(merged.title, id, hidden);

    // Rebuild search fields from the merged values.
    // Privacy: a hidden name (hide_title) is kept OUT of the search blob so it
    // can't be found by typing the name — mirrors create().
    const isJob = kind === 'job_opening' || kind === 'job_seeker';
    const searchTitle = hidden ? '' : merged.title;
    if (isJob) {
      const role = String(merged.job_role || '').trim();
      const extra = kind === 'job_opening' ? JOB_HIRING_KEYWORDS : JOB_SEEKER_KEYWORDS;
      patch.keywords_cache = role ? [role] : [];
      patch.free_keywords = [];
      // Persist the chosen role category + fold its synonyms into the blob so
      // role-based search/filter works on edited jobs too (mirrors the business branch).
      const cats = normalizeCategories(merged.categories, merged.category);
      patch.category = cats[0] || '';
      patch.categories = cats;
      const catSyn = cats.flatMap((c: string) => CATEGORY_BY_LABEL[c]?.synonyms || []);
      patch.search_blob = [role, role, searchTitle, ...JOB_BASE_KEYWORDS, ...extra,
        blobClip(merged.description), blobClip(merged.experience_description), ...catSyn].join(' ').toLowerCase();
    } else {
      const free = (merged.free_keywords || []).map((s: string) => s.trim()).filter(Boolean);
      patch.free_keywords = free;
      patch.keywords_cache = free;
      const cats = normalizeCategories(merged.categories, merged.category);
      patch.category = cats[0] || '';
      patch.categories = cats;
      const catSyn = cats.flatMap((c) => CATEGORY_BY_LABEL[c]?.synonyms || []);
      patch.search_blob = [searchTitle, searchTitle, ...free, ...free, merged.short_desc || '', blobClip(merged.description), ...catSyn]
        .join(' ').toLowerCase();
    }
    patch.search_norm = norm(patch.search_blob);

    await this.listings.findByIdAndUpdate(id, patch);
    // Delete the image files for any photos dropped in this edit.
    if (Array.isArray(dto.photos)) {
      const keep = new Set<string>(dto.photos);
      for (const k of ((existing as any).photos || [])) if (!keep.has(k)) this.removeMedia(k);
    }
    // Re-render the share card so edits (title/price/category…) are reflected.
    if ((merged.status || existing.status) === 'approved') this.warmOgCard(id);
    return { _id: id };
  }

  // Reports GROUPED by listing, for the admin moderation view. Each group has:
  // the listing (status/active/poster), every reporter (mobile + how many TOTAL
  // reports that user has ever filed → spot serial reporters), and the action
  // history taken on that listing.
  async listReports(): Promise<any[]> {
    const reports = await this.reports.find({ status: 'open' }).sort({ createdAt: -1 }).lean();
    if (!reports.length) return [];
    const listingIds = [...new Set(reports.map((r) => r.listing_id))];
    const reporterIds = [...new Set(reports.map((r) => r.user_id).filter(Boolean) as string[])];

    const [listings, reporterBrief, totalsAgg, actions] = await Promise.all([
      this.listings.find({ _id: { $in: listingIds } },
        { title: 1, mobile: 1, city: 1, status: 1, active: 1, posted_by_user_id: 1, posted_by_mobile: 1 }).lean(),
      this.auth.briefByIds(reporterIds),
      // lifetime report count per reporter (across ALL listings, any status)
      this.reports.aggregate([{ $match: { user_id: { $in: reporterIds } } }, { $group: { _id: '$user_id', n: { $sum: 1 } } }]),
      this.modActions.find({ listing_id: { $in: listingIds } }).sort({ createdAt: -1 }).lean(),
    ]);
    const byListing = new Map(listings.map((l) => [String(l._id), l as any]));
    const totals = new Map(totalsAgg.map((t: any) => [String(t._id), t.n]));
    const actionsBy = new Map<string, any[]>();
    for (const a of actions) {
      const k = String(a.listing_id);
      if (!actionsBy.has(k)) actionsBy.set(k, []);
      actionsBy.get(k)!.push({ action: a.action, admin: a.admin, note: a.note, at: (a as any).createdAt });
    }

    const groups = new Map<string, any>();
    for (const r of reports) {
      const k = String(r.listing_id);
      if (!groups.has(k)) {
        const l = byListing.get(k);
        groups.set(k, {
          listing_id: k,
          listing: l ? { _id: k, title: l.title, mobile: l.mobile, city: l.city, status: l.status, active: l.active !== false } : null,
          poster_user_id: l?.posted_by_user_id || null,
          poster_mobile: l?.posted_by_mobile || '',
          poster_blocked: false,
          reporters: [] as any[],
          actions: actionsBy.get(k) || [],
        });
      }
      const g = groups.get(k);
      const brief = r.user_id ? reporterBrief.get(String(r.user_id)) : undefined;
      g.reporters.push({
        reason: r.reason,
        details: r.details,
        mobile: r.reporter_mobile || brief?.mobile || '—',
        total_reports: r.user_id ? (totals.get(String(r.user_id)) || 1) : 1,
        at: (r as any).createdAt,
      });
    }
    // mark poster_blocked from the brief (poster may also be a reporter or not)
    const posterIds = [...new Set([...groups.values()].map((g) => g.poster_user_id).filter(Boolean))];
    const posterBrief = await this.auth.briefByIds(posterIds);
    for (const g of groups.values()) {
      g.poster_blocked = !!(g.poster_user_id && posterBrief.get(String(g.poster_user_id))?.blocked);
    }
    return [...groups.values()];
  }

  // Admin moderation action on a reported listing + audit log.
  async moderationAction(listingId: string, action: string, admin: string, note = '') {
    const l = await this.listings.findById(listingId, { posted_by_user_id: 1 }).lean();
    if (!l) throw new NotFoundException('Listing not found');
    const posterId = String((l as any).posted_by_user_id || '');
    if (action === 'hide') await this.listings.findByIdAndUpdate(listingId, { active: false });
    else if (action === 'show') await this.listings.findByIdAndUpdate(listingId, { active: true });
    else if (action === 'restrict') { if (posterId) await this.auth.setBlocked(posterId, true); }
    else if (action === 'unrestrict') { if (posterId) await this.auth.setBlocked(posterId, false); }
    else if (action === 'reviewed') await this.reports.updateMany({ listing_id: listingId, status: 'open' }, { status: 'reviewed' });
    else throw new BadRequestException('Unknown action.');
    await this.modActions.create({ listing_id: listingId, target_user_id: posterId, action, admin, note });
    return { ok: true };
  }
  async setStatus(id: string, status: 'approved' | 'rejected', adminId: string) {
    const patch: any = { status };
    if (status === 'approved') { patch.approved_by = adminId; patch.approved_at = new Date(); }
    const d = await this.listings.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!d) throw new NotFoundException('Listing not found');
    // Approved → pre-render the card; rejected → remove any cached one.
    if (status === 'approved') this.warmOgCard(id); else this.removeOgCard(id);
    return { _id: String(d._id), status: d.status };
  }

  // ---- Social link preview (Open Graph) for crawlers (WhatsApp/FB/Telegram…) --
  // nginx routes bot user-agents to this; humans get the SPA. Returns a tiny HTML
  // page whose og:* tags make a shared listing link unfurl with title + blurb +
  // (when the listing has a photo) a large thumbnail. Photos plug in later — the
  // pipeline is fully wired now.
  async ogHtml(rawPath: string): Promise<string> {
    const BASE = process.env.PUBLIC_BASE_URL || 'https://whatslocal.in';
    const path = String(rawPath || '/').split('?')[0];
    const segs = path.split('/').filter(Boolean);
    // Second-segment words that are browse pages, not listing slugs.
    const RESERVED = new Set(['business', 'job-opening', 'job-seeker', 'happening', 'sell', 'rent', 'other', 'cat', 'admin', 'post', 'my', 'categories', 'browse', 'l']);
    const proj = { title: 1, hide_title: 1, short_desc: 1, description: 1, category: 1, city: 1, state: 1, photos: 1, status: 1, active: 1, updatedAt: 1 };

    let listing: any = null;
    try {
      if (segs[0] === 'l' && segs[1] && /^[a-f0-9]{24}$/i.test(segs[1])) {
        listing = await this.listings.findOne({ _id: segs[1], status: 'approved', active: { $ne: false } }, proj).lean();
      } else if (segs.length === 2 && !RESERVED.has(segs[1].toLowerCase())) {
        const rx = new RegExp('^' + escapeRe(segs[1]) + '$', 'i');
        listing = await this.listings.findOne({ slug: rx, status: 'approved', active: { $ne: false } }, proj).lean();
      }
    } catch { /* fall back to brand defaults */ }

    const url = BASE + (path === '/' ? '' : path);
    let title = 'WhatsLocal — Gondia’s local directory';
    let desc = 'Find local shops, services and jobs in Gondia.';
    let image = '';
    let generated = false;
    if (listing) {
      title = maskTitle(listing.title, listing.hide_title);
      const city = [listing.city, listing.state].filter(Boolean).join(', ');
      desc = [listing.short_desc || listing.description || '', listing.category || '', city]
        .filter(Boolean).join(' · ').slice(0, 200) || desc;
      // Always the rendered /og/<id>.png — EITHER the generated card (no photo) OR
      // the uploaded cover photo branded with the city + whatslocal.in footer.
      // A ?v=<edit-version> busts WhatsApp/social image caches when the post (e.g.
      // its photo) changes. nginx ignores the query and serves the latest file.
      const ver = (listing as any).updatedAt ? new Date((listing as any).updatedAt).getTime().toString(36) : '';
      image = `${BASE}/og/${listing._id}.jpg${ver ? `?v=${ver}` : ''}`;
      generated = true;
    } else {
      // Browse / category page → a branded card with the section/category label
      // + live count + city footer. New /browse/:bucket/:sub first, else legacy.
      const b = (await this.resolveBrowsePath(segs)) || this.legacyBrowse(segs);
      if (b) {
        title = `${b.label} in ${b.cityName}`;
        desc = `Browse ${b.label.toLowerCase()} in ${b.cityName} on WhatsLocal — local jobs, shops, services & more.`;
        image = `${BASE}/api/v1/og/img?path=${encodeURIComponent(path)}`;
        generated = true;
      }
    }

    const e = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const dims = generated
      ? `\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/jpeg">`
      : '';
    const imgTags = image
      ? `\n<meta property="og:image" content="${e(image)}">${dims}\n<meta property="og:image:alt" content="${e(title)}">\n<meta name="twitter:card" content="summary_large_image">`
      : `\n<meta name="twitter:card" content="summary">`;
    return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>${e(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="WhatsLocal">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:url" content="${e(url)}">${imgTags}
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(desc)}">
<link rel="canonical" href="${e(url)}">
</head><body>
<script>location.replace(${JSON.stringify(url)})</script>
<a href="${e(url)}">${e(title)}</a>
</body></html>`;
  }

  // Resolve a browse/category path to its share-card meta (label, emoji, unit,
  // and the search filter for the count). Returns null for non-browse paths.
  private browseLabel(segs: string[]): { label: string; cityName: string; emoji: string; unit: string; filter: any } | null {
    if (!segs.length) return null;
    const cityName = String(segs[0]).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const KINDS: Record<string, { label: string; emoji: string; unit: string; kind: string }> = {
      'job-opening': { label: 'Job Openings', emoji: '💼', unit: 'jobs', kind: 'job_opening' },
      'job-seeker': { label: 'People Looking for Work', emoji: '🙋', unit: 'job seekers', kind: 'job_seeker' },
      business: { label: 'Businesses & Services', emoji: '🏪', unit: 'listings', kind: 'business' },
      happening: { label: 'Events, News & Updates', emoji: '🎉', unit: 'updates', kind: 'happening' },
    };
    const PT: Record<string, { label: string; emoji: string; unit: string; filter: any }> = {
      sell: { label: 'Used Items for Sale', emoji: '🏷️', unit: 'items', filter: { post_type: 'sell', sale_or_rent: { $ne: 'rent' } } },
      rent: { label: 'On Rent', emoji: '🔑', unit: 'items', filter: { post_type: 'sell', sale_or_rent: 'rent' } },
      other: { label: 'Other Listings', emoji: '📦', unit: 'listings', filter: { post_type: 'other' } },
    };
    if (segs.length === 1) return { label: `WhatsLocal ${cityName}`, cityName, emoji: '📍', unit: 'local listings', filter: {} };
    if (segs[1] === 'cat' && segs[2]) {
      const m = CATEGORY_BY_KEY[segs[2]];
      if (!m) return null;
      return { label: m.label, cityName, emoji: m.emoji || '🗂️', unit: 'listings', filter: { category: m.label } };
    }
    if (KINDS[segs[1]]) { const k = KINDS[segs[1]]; return { label: k.label, cityName, emoji: k.emoji, unit: k.unit, filter: { kind: k.kind } }; }
    if (PT[segs[1]]) { const k = PT[segs[1]]; return { label: k.label, cityName, emoji: k.emoji, unit: k.unit, filter: k.filter }; }
    if (segs[1] === 'categories') return { label: 'All Categories', cityName, emoji: '🗂️', unit: 'categories', filter: {} };
    return null;
  }

  // The NEW /browse/:bucket/:sub share pages → a card for that exact category.
  // Resolves the category SLUG back to its real label (async, from the data) so
  // "/browse/sell/furniture" shows a Furniture card with the right count.
  private async resolveBrowsePath(segs: string[]): Promise<{ label: string; cityName: string; emoji: string; filter: any } | null> {
    if (segs[1] !== 'browse' || !segs[2]) return null;
    const cityName = String(segs[0]).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const bucket = segs[2];
    const subSlug = segs[3];
    const BUCKET: Record<string, { label: string; emoji: string; filter: any }> = {
      business: { label: 'Business & Services', emoji: '🏪', filter: { kind: 'business', post_type: { $nin: ['sell', 'other'] } } },
      sell: { label: 'Buy, Sell & Rent', emoji: '🛒', filter: { post_type: 'sell' } },
      jobs: { label: 'Jobs', emoji: '💼', filter: {} },
      happening: { label: 'Events & News', emoji: '🎉', filter: { kind: 'happening' } },
    };
    const bc = BUCKET[bucket]; if (!bc) return null;
    const filter: any = { ...bc.filter };
    let label = bc.label, emoji = bc.emoji;
    if (subSlug) {
      if (bucket === 'jobs') {
        if (subSlug === 'seekers') { filter.kind = 'job_seeker'; label = 'Job Seekers'; emoji = '🙋'; }
        else { filter.kind = 'job_opening'; label = 'Job Openings'; emoji = '📢'; }
      } else if (bucket === 'happening') {
        label = subSlug === 'news' ? 'News' : 'Events';
        emoji = subSlug === 'news' ? '📰' : '🎊';
      } else {
        try {
          const cityRx = new RegExp('^' + escapeRe(cityName) + '$', 'i');
          const cats: string[] = await this.listings.distinct('categories', { status: 'approved', active: { $ne: false }, city: cityRx, ...bc.filter });
          const match = cats.find((c) => catSlug(c) === subSlug);
          if (match) { filter.categories = match; label = shortCat(match); }
        } catch { /* keep the bucket label */ }
      }
    }
    return { label, cityName, emoji, filter };
  }

  // Legacy browse paths → same {label, emoji, mongo filter} shape.
  private legacyBrowse(segs: string[]): { label: string; cityName: string; emoji: string; filter: any } | null {
    const l = this.browseLabel(segs);
    if (!l) return null;
    const filter: any = {};
    if (l.filter.kind) filter.kind = l.filter.kind;
    if (l.filter.post_type) filter.post_type = l.filter.post_type;
    if (l.filter.sale_or_rent) filter.sale_or_rent = l.filter.sale_or_rent;
    if (l.filter.category) filter.categories = l.filter.category;
    return { label: l.label, cityName: l.cityName, emoji: l.emoji, filter };
  }

  // Share-card JPEG for a browse/category page: category/section emoji + label +
  // live count + city · whatslocal.in footer (same look as listing cards).
  async ogBrowseImage(path: string): Promise<Buffer> {
    const segs = String(path || '').split('?')[0].split('/').filter(Boolean);
    const cacheKey = segs.join('/');
    const hit = this.browseCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.buf;

    const b = (await this.resolveBrowsePath(segs)) || this.legacyBrowse(segs);
    const jpeg = (svg: string) => sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    let buf: Buffer;
    if (!b) {
      buf = await jpeg(buildCardSvg({ emoji: '📍', chip: 'Gondia’s local directory', title: 'WhatsLocal', city: 'Gondia, Maharashtra' }));
    } else {
      const cityRx = new RegExp('^' + escapeRe(b.cityName) + '$', 'i');
      // Lean indexed count (no documents fetched) + the city's state, in parallel.
      const filter: any = { status: 'approved', active: { $ne: false }, city: cityRx, ...b.filter };
      const unit = 'listings';
      let total = 0; let state = '';
      try {
        const [n, s] = await Promise.all([
          this.listings.countDocuments(filter),
          this.listings.findOne({ city: cityRx }, { state: 1 }).lean(),
        ]);
        total = n; state = (s as any)?.state || '';
      } catch { /* count/state optional */ }
      const disp = total >= 10 ? `${Math.floor(total / 10) * 10}+` : `${total}`;
      const accent = total > 0 ? `${disp} ${unit}` : '';
      const cityFooter = [b.cityName, state].filter(Boolean).join(', ');
      buf = await jpeg(buildCardSvg({ emoji: b.emoji, chip: `${unit} in ${b.cityName}`, title: b.label, accent, city: cityFooter }));
    }
    if (this.browseCache.size > 200) this.browseCache.clear();   // simple bound
    this.browseCache.set(cacheKey, { buf, at: Date.now() });
    return buf;
  }

  // ===== Dynamic share-card image (PNG) =====
  // Rendered from the listing's own data; cached by id+updatedAt. Returns a
  // generic brand card if the id is missing/unknown so the endpoint never 500s.
  private ogImgCache = new Map<string, Buffer>();
  // Short-TTL cache for browse/category cards so the crawler never waits on a
  // count + render (and we don't re-do that work on every fetch).
  private browseCache = new Map<string, { buf: Buffer; at: number }>();

  // Returns the share-card PNG for a listing id. Only APPROVED+active listings
  // render their own card (else a generic brand card — never leaks a pending
  // post). Generated once, cached in memory, AND written to the disk cache that
  // nginx serves from (so it survives restarts and skips Node on later fetches).
  async ogImage(id: string): Promise<Buffer> {
    let listing: any = null;
    if (/^[a-f0-9]{24}$/i.test(id || '')) {
      const proj = {
        title: 1, hide_title: 1, category: 1, city: 1, state: 1, post_type: 1, kind: 1,
        sale_or_rent: 1, price: 1, rent_period: 1, salary_min: 1, salary_max: 1, job_role: 1,
        experience_months: 1, happening_type: 1, event_date: 1, photos: 1, updatedAt: 1,
      };
      try { listing = await this.listings.findOne({ _id: id, status: 'approved', active: { $ne: false } }, proj).lean(); } catch { /* ignore */ }
    }

    const key = listing ? `${id}:${+new Date((listing as any).updatedAt || 0)}` : 'brand';
    let img = this.ogImgCache.get(key);
    if (!img) {
      img = await this.renderOgImage(listing);
      if (this.ogImgCache.size > 800) this.ogImgCache.clear();   // simple bound
      this.ogImgCache.set(key, img);
    }
    // Persist real cards to the nginx-served disk cache (best-effort).
    if (listing) fsp.writeFile(`${OG_DIR}/${id}.jpg`, img).catch(() => { /* dir may not exist locally */ });
    return img;
  }

  // The share image: a listing WITH a cover photo → that photo, cropped to the
  // 1200×630 share frame and branded with the city + whatslocal.in footer;
  // otherwise → the generated title/price card. Falls back to the card if the
  // photo file is missing/unreadable.
  // Output is JPEG, not PNG: WhatsApp silently drops over-large preview images,
  // and a 1200×630 photo is ~120 KB as JPEG vs ~750 KB as PNG. Text cards stay
  // crisp at q92; photos at q84.
  private async renderOgImage(listing: any): Promise<Buffer> {
    const card = (b: Buffer) => sharp(b).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    if (!listing) {
      return card(Buffer.from(buildCardSvg({ emoji: '📍', chip: 'Gondia’s local directory', title: 'WhatsLocal', city: 'Gondia, Maharashtra' })));
    }
    const photoKey = (listing.photos || [])[0];
    if (photoKey && /^[a-z0-9]{6,40}$/.test(photoKey)) {
      try {
        const city = [listing.city, listing.state].filter(Boolean).join(', ');
        // Fit the WHOLE photo into the 1200×630 share frame (no crop) on the brand
        // teal, so portrait product shots show in full — matching the generated cards.
        const cover = await sharp(`${MEDIA_DIR}/${photoKey}/view.jpg`)
          .resize(1200, 630, { fit: 'contain', background: { r: 11, g: 86, b: 80 } })
          .toBuffer();
        return await sharp(cover)
          .composite([{ input: Buffer.from(buildPhotoOverlaySvg(city)), top: 0, left: 0 }])
          .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      } catch { /* photo unreadable → fall through to the generated card */ }
    }
    return card(Buffer.from(buildCardSvg(cardInputForListing(listing))));
  }

  // Pre-render a listing's card to disk (fire-and-forget) so its very first
  // WhatsApp fetch hits a ready file. Called on approve / edit / publish.
  private warmOgCard(id: string): void {
    // Render the card to disk, THEN warm the social crawler cache (so the very
    // first WhatsApp share already gets the full, ready image — no flaky first scrape).
    void this.ogImage(String(id)).then(() => this.prewarmSocial(String(id))).catch(() => { /* ignore */ });
  }

  // Force Facebook's crawler (the one WhatsApp shares its link-preview cache with)
  // to re-scrape this listing's share URL now that its image is freshly rendered,
  // so the large-image preview is cached before anyone shares. No-op unless an FB
  // app token (FB_SCRAPE_TOKEN = "APP_ID|APP_SECRET") is configured.
  private async prewarmSocial(id: string): Promise<void> {
    const token = process.env.FB_SCRAPE_TOKEN;
    if (!token) return;
    try {
      const d = await this.listings.findOne({ _id: id, status: 'approved', active: { $ne: false } }, { slug: 1, city: 1, updatedAt: 1 }).lean();
      if (!(d as any)?.slug) return;
      const BASE = process.env.PUBLIC_BASE_URL || 'https://whatslocal.in';
      const citySlug = String((d as any).city || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'gondia';
      const ver = (d as any).updatedAt ? new Date((d as any).updatedAt).getTime().toString(36) : '';
      // Warm both share variants — with the version param (app Share button) and the bare URL.
      const urls = [`${BASE}/${citySlug}/${(d as any).slug}`];
      if (ver) urls.push(`${urls[0]}?s=${ver}`);
      for (const u of urls) {
        const api = `https://graph.facebook.com/?id=${encodeURIComponent(u)}&scrape=true&access_token=${encodeURIComponent(token)}`;
        await fetch(api, { method: 'POST' }).catch(() => { /* best-effort */ });
      }
    } catch { /* never throw from a warm */ }
  }
  // Drop a card when its listing is no longer publicly shareable.
  private removeOgCard(id: string): void { fsp.unlink(`${OG_DIR}/${id}.jpg`).catch(() => { /* not there */ }); }

  // ===== Listing photo upload =====
  // Re-encodes ONE uploaded image into two compressed JPEGs — a "view" for the
  // detail page (and the WhatsApp preview) and a smaller "thumb" for feed tiles.
  // EXIF (incl. GPS) is stripped by sharp, so photos never leak location. Returns
  // a key stored in the listing's `photos[]`; nginx serves /media/<key>/*.jpg.
  async processUpload(file: { buffer?: Buffer } | undefined): Promise<{ key: string; view: string; thumb: string }> {
    if (!file?.buffer?.length) throw new BadRequestException('No image provided.');
    const key = 'p' + randomBytes(8).toString('hex');
    const dir = `${MEDIA_DIR}/${key}`;
    try {
      const base = sharp(file.buffer, { failOn: 'error' }).rotate();   // auto-orient via EXIF, then drop metadata
      const [view, thumb] = await Promise.all([
        base.clone().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
        base.clone().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75, mozjpeg: true }).toBuffer(),
      ]);
      await fsp.mkdir(dir, { recursive: true });
      await Promise.all([
        fsp.writeFile(`${dir}/view.jpg`, view),
        fsp.writeFile(`${dir}/thumb.jpg`, thumb),
      ]);
    } catch {
      throw new BadRequestException('Could not process that image. Please use a JPG or PNG.');
    }
    return { key, view: `/media/${key}/view.jpg`, thumb: `/media/${key}/thumb.jpg` };
  }

  // Delete one photo's files. Key format is guarded so a bad value can never
  // escape MEDIA_DIR (path traversal).
  private removeMedia(key: string): void {
    if (!/^[a-z0-9]{6,40}$/.test(key)) return;
    fsp.rm(`${MEDIA_DIR}/${key}`, { recursive: true, force: true }).catch(() => { /* gone already */ });
  }

  // Sweep orphaned upload images: any /media/<key> folder that no listing
  // references AND is older than the grace window (covers photos uploaded for a
  // post that was never submitted, plus any missed edit-time deletions).
  private async sweepOrphanMedia(): Promise<void> {
    try {
      const entries = await fsp.readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => [] as any[]);
      const dirs = entries.filter((e: any) => e.isDirectory() && /^[a-z0-9]{6,40}$/.test(e.name));
      if (!dirs.length) return;
      const docs = await this.listings.find({ photos: { $exists: true, $ne: [] } }, { photos: 1 }).lean();
      const referenced = new Set<string>();
      for (const d of docs) for (const k of ((d as any).photos || [])) referenced.add(k);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;   // 24h grace for in-progress posts
      for (const dir of dirs) {
        if (referenced.has(dir.name)) continue;
        const path = `${MEDIA_DIR}/${dir.name}`;
        const st = await fsp.stat(path).catch(() => null);
        if (st && st.mtimeMs < cutoff) await fsp.rm(path, { recursive: true, force: true }).catch(() => { /* ignore */ });
      }
    } catch { /* best-effort cleanup — never throw */ }
  }
}

// Indian-grouped rupees, e.g. ₹3,50,000.
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(Math.round(n));

const EMOJI_FALLBACK: Record<string, string> = {
  sell: '🏷️', hiring: '💼', job_seeker: '🙋', happening: '🎉', other: '📦',
  business: '🏪', service: '🛠️', ngo: '🤝',
};

// Map a listing to the share-card fields, adapting the eyebrow + highlight line
// to the post type (price, salary, experience, event date…).
function cardInputForListing(l: any): CardInput {
  const pt: string = l.post_type || 'business';
  const cat: string = l.category || '';
  const catMeta = cat ? CATEGORY_BY_LABEL[cat] : undefined;
  // Short category for the eyebrow — drop everything after the first — / ( so a
  // label like "Property — House / Flat / Plot / Shop" reads as just "Property".
  const shortCat = cat ? cat.split(/[—(/]/)[0].trim() : '';
  const city = [l.city, l.state].filter(Boolean).join(', ');
  const ht: string = l.happening_type || '';

  let emoji = catMeta?.emoji || '';
  if (!emoji) emoji = pt === 'happening' ? (ht === 'news' ? '📰' : ht === 'info' ? 'ℹ️' : '🎉') : (EMOJI_FALLBACK[pt] || '📍');

  let chip = '';
  let accent = '';
  if (pt === 'sell') {
    const rent = l.sale_or_rent === 'rent';
    chip = `${rent ? 'For Rent' : 'For Sale'}${shortCat ? ' · ' + shortCat : ''}`;
    if (l.price != null && l.price > 0) {
      const per = String(l.rent_period || '').replace(/^per\s+/i, '').trim();
      accent = inr(l.price) + (rent ? ` / ${per || 'month'}` : '');
    }
  } else if (pt === 'hiring') {
    chip = 'Job Opening' + (l.job_role ? ' · ' + l.job_role : '');
    const lo = l.salary_min, hi = l.salary_max;
    if (lo && hi) accent = `${inr(lo)}–${inr(hi)} / mo`;
    else if (lo || hi) accent = `${inr(lo || hi)} / mo`;
  } else if (pt === 'job_seeker') {
    chip = 'Looking for work';
    const m = l.experience_months;
    if (m && m >= 12) accent = `${Math.floor(m / 12)}+ yrs experience`;
    else if (m) accent = `${m} months experience`;
  } else if (pt === 'happening') {
    chip = ht === 'news' ? 'Local News' : ht === 'info' ? 'Information' : 'Event';
    if (ht === 'event' && l.event_date) accent = String(l.event_date);
  } else {
    chip = shortCat || (pt === 'other' ? 'Listing' : 'Local Business');
  }

  return { emoji, chip: chip.slice(0, 42), title: maskTitle(l.title, l.hide_title), accent, city };
}
