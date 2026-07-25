import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AnalyticsEventInput, AnalyticsSummary, DeviceInfo } from '@whatslocal/types';
import { maskTitle } from '@whatslocal/types';
import { AnalyticsEvent, AnalyticsEventDocument } from './analytics.schema';
import { Listing, ListingDocument } from '../listings/listing.schema';
import { toPublic } from '../listings/listings.service';
import { AuthService } from '../auth/auth.service';

const VISITORS_PAGE = 50;

// Rough AFFLUENCE signal (device + language + interest) for targeting — a proxy,
// not identity. In India iPhone ≫ Android on income; English preference and
// interest in high-value categories push it up; a jobs/labour lean pulls it down.
// Works for anonymous visitors too; once they log in, the login backfills their
// past events with user_id so this rolls up to their profile.
const HI_VALUE = /propert|flat|house|plot|\bcar\b|bike|electron|computer|laptop|mobile|gold|jewel/i;
const LO_VALUE = /\bjob|hir|labour|labor|maid|househelp|house help|grocery|kirana|daily/i;
export function incomeSignal(opts: { os?: string; brand?: string; lang?: string; topLabel?: string }): { score: number; tier: 'High' | 'Mid' | 'Low' } {
  const { os, brand, lang, topLabel } = opts;
  let s = 35;
  if (/iOS/i.test(os || '') || /Apple/i.test(brand || '')) s += 40;         // iPhone — strongest signal
  else if (/Pixel|OnePlus|Nothing|iQOO/i.test(brand || '')) s += 18;        // Android flagship-ish
  else if (/Samsung/i.test(brand || '')) s += 10;
  else if (/Android/i.test(os || '')) s += 3;                               // budget-leaning Android
  else s += 15;                                                             // desktop / other
  if (lang === 'en') s += 18;                                               // English preference
  if (topLabel && HI_VALUE.test(topLabel)) s += 8;
  else if (topLabel && LO_VALUE.test(topLabel)) s -= 8;
  s = Math.max(0, Math.min(100, s));
  return { score: s, tier: s >= 65 ? 'High' : s >= 38 ? 'Mid' : 'Low' };
}

// Interest bucketing (shared by visitorDetail + registeredUsers). A listing
// buckets by its business category, else by kind/post_type so non-category
// posts (jobs / happenings / sell) still count as an interest.
function bucketOf(l: any): { key: string; label: string } | null {
  if (!l) return null;
  if (l.category) return { key: 'cat:' + l.category, label: l.category };
  if (l.kind === 'job_opening' || l.kind === 'job_seeker') return { key: 'jobs', label: 'Jobs' };
  if (l.kind === 'happening') return { key: 'happening', label: 'Happenings' };
  if (l.post_type === 'sell') return { key: 'sell', label: 'Sell / Rent' };
  return { key: 'other', label: 'Other' };
}
// Contact-action → interest points (call/whatsapp strongest, reveal weakest).
const CONTACT_PTS: Record<string, number> = { call: 30, whatsapp: 30, cta: 20, cta2: 20, directions: 20, share: 15, copy: 12, open: 8 };
// A real "contacted" signal = they ACTED on the revealed number (called /
// messaged / copied it), not merely tapped "Show number" (open) or shared/CTA.
// This is what the admin post-analytics + registered-users "contacts" count.
const CONTACTED_TARGETS = ['call', 'whatsapp', 'copy'];
const hostOf = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private readonly model: Model<AnalyticsEventDocument>,
    @InjectModel(Listing.name) private readonly listings: Model<ListingDocument>,
    private readonly auth: AuthService,
  ) {}

  async record(input: AnalyticsEventInput, device: DeviceInfo, ip: string): Promise<void> {
    await this.model.create({
      ts: new Date(),
      type: input.type,
      visitor_id: input.visitor_id,
      session_id: input.session_id,
      user_id: input.user_id ?? null,
      path: input.path ?? '',
      referrer: input.referrer ?? '',
      city: input.city ?? null,
      pincode: input.pincode ?? null,
      query: input.query ?? null,
      result_count: input.result_count ?? null,
      listing_id: input.listing_id ?? null,
      target: input.target ?? null,
      vertical: input.vertical ?? null,
      category: input.category ?? null,
      duration_ms: input.duration_ms ?? null,
      lang: input.lang ?? null,
      device,
      ip,
    });
  }

  // Identity-linking: when a visitor logs in, stamp their accumulated anonymous
  // history with the now-known user_id so the admin can see one continuous
  // person (we had all the behaviour; this attaches the identity).
  async identify(visitorId: string, userId: string): Promise<{ linked: number }> {
    if (!visitorId || !userId) return { linked: 0 };
    const res = await this.model.updateMany(
      { visitor_id: visitorId, $or: [{ user_id: null }, { user_id: { $exists: false } }] },
      { $set: { user_id: userId } },
    );
    return { linked: (res as any).modifiedCount ?? 0 };
  }

  // v2 personalization signal: infer this person's vertical affinity from the
  // routes they've browsed recently (page paths encode the vertical). Keyed on
  // user_id when known, else visitor_id (so it follows them through login).
  // Read-only + defensive — the home falls back to its client-side v1 if this
  // returns nothing.
  async affinity(visitorId?: string, userId?: string): Promise<Record<string, number>> {
    const ors: any[] = [];
    if (userId) ors.push({ user_id: userId });
    if (visitorId) ors.push({ visitor_id: visitorId });
    if (!ors.length) return {};
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const rows = await this.model.find({ $or: ors, ts: { $gte: cutoff } }, { path: 1, target: 1, vertical: 1 }).sort({ ts: -1 }).limit(600).lean();
    const score: Record<string, number> = {};
    const bump = (k: string, w: number) => { score[k] = (score[k] || 0) + w; };
    for (const e of rows as any[]) {
      const p = String(e.path || '');
      // a reveal/contact action is a much stronger signal than a page view
      const w = e.target ? 4 : 1;
      // 1) Listing-level signal (detail views + shared-link landings). A permalink
      //    path doesn't encode the vertical, so we read the vertical stamped on the
      //    event. Weighted strongly (3) so ONE shared post already gives a fresh
      //    visitor a clear top interest; browsing can still overtake it.
      if (e.vertical) { bump(String(e.vertical), e.target ? 4 : 3); continue; }
      // 2) Path-based signal (browse pages).
      if (/\/business\b/.test(p)) bump('business', w);
      else if (/\/(job-opening|job-seeker)\b/.test(p)) bump('jobs', w);
      else if (/\/rent\b/.test(p)) bump('rent', w);
      else if (/\/sell\b/.test(p)) bump('sell', w);
      else if (/\/complaints\b/.test(p)) bump('complaints', w);
      else if (/\/happening\b/.test(p)) bump('happening', w);
    }
    return score;
  }

  // "Trending this week" — the home's social-proof rail + cold-start hero. Ranks
  // listings by how many people ACTED on their contact (call/whatsapp/copy/open/
  // share) in the last N days. Popularity that can't be faked by the owner (it's
  // demand, not views). Resolves to public listings, approved + active + in-city.
  async trending(city?: string, days = 7, limit = 12): Promise<{ results: any[] }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const agg = await this.model.aggregate([
      { $match: { type: 'contact_click', ts: { $gte: cutoff }, listing_id: { $ne: null } } },
      { $group: { _id: '$listing_id', c: { $sum: 1 } } },
      { $sort: { c: -1 } },
      { $limit: 80 },
    ]);
    const ids = agg.map((r: any) => r._id).filter(Boolean).map(String);
    if (!ids.length) return { results: [] };
    const filter: any = { _id: { $in: ids }, status: 'approved', active: { $ne: false } };
    if (city) filter.city = new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const pii = { mobile: 0, alt_phone: 0, whatsapp: 0, search_blob: 0, posted_by_mobile: 0, posted_by_user_id: 0, approved_by: 0, approved_at: 0, source: 0 };
    const docs = await this.listings.find(filter, pii).lean();
    // Preserve the demand ranking (find() returns in index order, not $in order).
    const rank = new Map(ids.map((id, i) => [id, i]));
    docs.sort((a: any, b: any) => (rank.get(String(a._id)) ?? 1e9) - (rank.get(String(b._id)) ?? 1e9));
    return { results: docs.slice(0, limit).map((d) => toPublic(d)) };
  }

  // Contact-interest LEADS feed (monetization): every time someone reveals or
  // acts on a post's contact (call / whatsapp / copy / open / share / cta), we
  // already log a `contact_click`. This resolves those into a readable feed —
  // WHO (viewer, mobile when logged in) showed interest in WHICH post and did
  // WHAT — newest first, so the owner can see demand and charge on it later.
  async leads(page = 1): Promise<any> {
    const PAGE = 50;
    const filter = { type: 'contact_click' };
    const [rows, total] = await Promise.all([
      this.model.find(filter).sort({ ts: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
      this.model.countDocuments(filter),
    ]);
    // Resolve listing titles/kind (masked per hide_title) and poster.
    const lids = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))].map(String);
    const lmap = new Map<string, any>();
    if (lids.length) {
      const ls = await this.listings.find(
        { _id: { $in: lids } },
        { title: 1, hide_title: 1, slug: 1, kind: 1 },
      ).lean();
      for (const l of ls) lmap.set(String(l._id), l);
    }
    // Resolve viewer identity (mobile) for logged-in viewers.
    const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))].map(String);
    const brief = uids.length ? await this.auth.briefByIds(uids) : new Map();
    const results = rows.map((r) => {
      const l = r.listing_id ? lmap.get(String(r.listing_id)) : null;
      return {
        ts: r.ts,
        target: r.target || 'open',
        identified: !!r.user_id,
        viewer_user_id: r.user_id ? String(r.user_id) : null,
        viewer_mobile: r.user_id ? (brief.get(String(r.user_id))?.mobile || null) : null,
        viewer_visitor_id: String(r.visitor_id || ''),
        listing_id: r.listing_id ? String(r.listing_id) : null,
        listing_title: l ? maskTitle(l.title, l.hide_title) : null,
        listing_kind: l?.kind || null,
        listing_slug: l?.slug || null,
      };
    });
    return { page, page_size: PAGE, total, results };
  }

  // ---- Registered users (drill-in from the dashboard "Registered users" card).
  // One row per OTP-registered user (newest registration first) with an at-a-
  // glance profile: where they came from, how many contacts they pulled, when
  // they registered + first visited, time spent, language, top interest, income.
  // Clicking a row opens the full activity tracker (visitorDetail by user_id).
  async registeredUsers() {
    const users = await this.auth.listUsers();          // newest-first
    if (!users.length) return { results: [] };
    const ids = users.map((u) => u.id);

    const events = await this.model.find({ user_id: { $in: ids } }).sort({ ts: 1 }).lean();
    const byUser: Record<string, any[]> = {};
    for (const e of events) { const k = String(e.user_id); (byUser[k] = byUser[k] || []).push(e); }

    // Listings the users touched (for interest bucketing) + their own posts.
    const lids = [...new Set(events.filter((e) => e.listing_id).map((e) => String(e.listing_id)))];
    const listings = lids.length ? await this.listings.find({ _id: { $in: lids } }, { category: 1, kind: 1, post_type: 1 }).lean() : [];
    const lmap = new Map(listings.map((l) => [String(l._id), l as any]));
    const own = await this.listings.find({ posted_by_user_id: { $in: ids } }, { posted_by_user_id: 1, category: 1, kind: 1, post_type: 1 }).lean();
    const ownByUser: Record<string, any[]> = {};
    for (const l of own) { const k = String((l as any).posted_by_user_id); (ownByUser[k] = ownByUser[k] || []).push(l); }

    const results = users.map((u) => {
      const evs = byUser[u.id] || [];
      const bySession: Record<string, number[]> = {};
      const langCount: Record<string, number> = {};
      const osCount: Record<string, number> = {};
      const brandCount: Record<string, number> = {};
      const contactListings = new Set<string>();
      for (const e of evs) {
        (bySession[e.session_id] = bySession[e.session_id] || []).push(new Date(e.ts).getTime());
        if (e.lang) langCount[e.lang] = (langCount[e.lang] || 0) + 1;
        const dos = (e.device as any)?.os; if (dos) osCount[dos] = (osCount[dos] || 0) + 1;
        const dbr = (e.device as any)?.brand; if (dbr) brandCount[dbr] = (brandCount[dbr] || 0) + 1;
        if (e.type === 'contact_click' && CONTACTED_TARGETS.includes(String(e.target)) && e.listing_id) contactListings.add(String(e.listing_id));
      }
      let engaged = 0;
      for (const k of Object.keys(bySession)) { const ts = bySession[k]; engaged += Math.max(...ts) - Math.min(...ts); }

      // Top interest via the same points model as visitorDetail.
      const interest: Record<string, { label: string; points: number }> = {};
      const addPts = (l: any, pts: number) => { const b = bucketOf(l); if (!b || pts <= 0) return; const x = interest[b.key] = interest[b.key] || { label: b.label, points: 0 }; x.points += pts; };
      evs.forEach((e, i) => {
        const l = e.listing_id ? lmap.get(String(e.listing_id)) : null; if (!l) return;
        const nxt = evs[i + 1];
        let dwell = 15;
        if (nxt && nxt.session_id === e.session_id) dwell = Math.min(Math.max((new Date(nxt.ts).getTime() - new Date(e.ts).getTime()) / 1000, 0), 300);
        if (e.type === 'listing_view') addPts(l, 3 + Math.min(dwell / 60, 5) * 6);
        else if (e.type === 'contact_click') addPts(l, CONTACT_PTS[String(e.target)] ?? 8);
      });
      for (const l of (ownByUser[u.id] || [])) addPts(l, 40);
      const topInterest = Object.values(interest).sort((a, b) => b.points - a.points)[0]?.label || null;

      const topLang = Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const topOs = Object.entries(osCount).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topBrand = Object.entries(brandCount).sort((a, b) => b[1] - a[1])[0]?.[0];
      const inc = incomeSignal({ os: topOs, brand: topBrand, lang: topLang === 'en' ? 'en' : 'hi', topLabel: topInterest || undefined });
      const first = evs[0];

      return {
        user_id: u.id,
        mobile: u.mobile,
        blocked: u.blocked,
        registered_at: u.created_at,
        first_seen: first ? first.ts : null,
        last_seen: evs.length ? evs[evs.length - 1].ts : null,
        source: first ? (hostOf(first.referrer) || 'direct / link') : '—',
        contacts_requested: contactListings.size,
        time_spent_seconds: Math.round(engaged / 1000),
        language: topLang,
        interest: topInterest,
        income: inc.tier,
        income_score: inc.score,
        events: evs.length,
      };
    });
    return { results };
  }

  // ---- Per-post analytics (drill-in from the dashboard "Number of posts" card).
  // For every LIVE post: landings (sessions that arrived directly on it via a
  // shared link), total distinct visitors who opened it, total views, and how
  // many distinct people requested its contact. Sorted by reach (visitors).
  async postAnalytics() {
    const posts = await this.listings.find(
      { status: 'approved', active: { $ne: false } },
      { title: 1, hide_title: 1, slug: 1, kind: 1, city: 1, category: 1, createdAt: 1, pinned: 1, source: 1 },
    ).lean();
    if (!posts.length) return { results: [] };

    // Views + distinct visitors per listing.
    const viewAgg = await this.model.aggregate([
      { $match: { type: 'listing_view', listing_id: { $ne: null } } },
      { $group: { _id: '$listing_id', views: { $sum: 1 }, visitors: { $addToSet: '$visitor_id' } } },
    ]);
    const viewMap = new Map(viewAgg.map((r: any) => [String(r._id), { views: r.views, visitors: (r.visitors || []).length }]));

    // Distinct people who actually CONTACTED (called / messaged / copied the
    // number) — not mere reveals or shares. See CONTACTED_TARGETS.
    const contactAgg = await this.model.aggregate([
      { $match: { type: 'contact_click', target: { $in: CONTACTED_TARGETS }, listing_id: { $ne: null } } },
      { $group: { _id: '$listing_id', people: { $addToSet: '$visitor_id' }, actions: { $sum: 1 } } },
    ]);
    const contactMap = new Map(contactAgg.map((r: any) => [String(r._id), { people: (r.people || []).length, actions: r.actions }]));

    // Landings = sessions whose FIRST event resolves to this post (came via link).
    const firstEvents = await this.model.aggregate([
      { $sort: { ts: 1 } },
      { $group: { _id: '$session_id', path: { $first: '$path' }, listing_id: { $first: '$listing_id' }, visitor: { $first: '$visitor_id' } } },
    ]);
    const idSet = new Set(posts.map((p) => String(p._id)));
    const slugMap = new Map(posts.filter((p) => (p as any).slug).map((p) => [String((p as any).slug).toLowerCase(), String(p._id)]));
    const RESERVED = new Set(['business', 'job-opening', 'job-seeker', 'happening', 'sell', 'rent', 'other', 'cat', 'admin', 'post', 'my', 'categories', 'l']);
    const landing = new Map<string, Set<string>>();
    for (const s of firstEvents) {
      let lid: string | null = null;
      if (s.listing_id && idSet.has(String(s.listing_id))) lid = String(s.listing_id);
      else {
        const segs = String(s.path || '').split('?')[0].split('/').filter(Boolean);
        if (segs[0] === 'l' && segs[1] && idSet.has(segs[1])) lid = segs[1];
        else if (segs.length === 2 && !RESERVED.has(String(segs[1]).toLowerCase())) lid = slugMap.get(String(segs[1]).toLowerCase()) || null;
      }
      if (lid) { const set = landing.get(lid) || landing.set(lid, new Set()).get(lid)!; set.add(String(s.visitor || s._id)); }
    }

    const results = posts.map((p) => {
      const id = String(p._id);
      const v = viewMap.get(id) || { views: 0, visitors: 0 };
      const c = contactMap.get(id) || { people: 0, actions: 0 };
      return {
        listing_id: id,
        title: maskTitle((p as any).title, (p as any).hide_title),
        kind: (p as any).kind || null,
        city: (p as any).city || null,
        landings: landing.get(id)?.size || 0,
        visitors: v.visitors,
        views: v.views,
        contacts: c.people,
        contact_actions: c.actions,
        created_at: (p as any).createdAt || null,
        pinned: !!(p as any).pinned,
        self_posted: (p as any).source !== 'admin',
      };
      // Pinned posts sit at the top of the admin table too — that's where you go
      // to see (and undo) what you've pinned.
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.visitors - a.visitors || b.views - a.views);

    return { results };
  }

  // Public-safe: number of VISITS today (= distinct sessions, optionally for a
  // city). A session id lives in sessionStorage, so it's stable across page
  // changes within one visit but new on each fresh visit — so two visits by the
  // same person count as 2, while moving between pages in one visit counts once.
  async visitorsToday(city?: string): Promise<number> {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const match: any = { ts: { $gte: start } };
    if (city) match.city = city;
    const ids = await this.model.distinct('session_id', match);
    return ids.length;
  }

  // USER REPORT — day-wise visitors split into NEW vs REPEAT, over a date range.
  // "New" = this is the first day that visitor was EVER seen (all-time first
  // event), so the split is genuine acquisition vs returning, not first-in-range.
  // Days are IST so they line up with how the owner reads a day.
  async userReport(from: Date, to: Date): Promise<any> {
    const TZ = 'Asia/Kolkata';
    const dayOf = { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: TZ } };
    // One row per (visitor, day) active inside the range.
    const pairs: any[] = await this.model.aggregate([
      { $match: { ts: { $gte: from, $lte: to }, visitor_id: { $nin: [null, ''] } } },
      { $group: { _id: { v: '$visitor_id', d: dayOf } } },
    ]);
    const visitors = [...new Set(pairs.map((p) => String(p._id.v)))];
    // All-time first-seen day per visitor → tells us which day they were "new".
    const firstDay = new Map<string, string>();
    if (visitors.length) {
      const firsts: any[] = await this.model.aggregate([
        { $match: { visitor_id: { $in: visitors } } },
        { $group: { _id: '$visitor_id', first: { $min: '$ts' } } },
        { $project: { d: { $dateToString: { format: '%Y-%m-%d', date: '$first', timezone: TZ } } } },
      ]);
      for (const f of firsts) firstDay.set(String(f._id), f.d);
    }
    const acc = new Map<string, { new: number; repeat: number }>();
    for (const p of pairs) {
      const d = String(p._id.d); const v = String(p._id.v);
      const e = acc.get(d) || { new: 0, repeat: 0 };
      if (firstDay.get(v) === d) e.new += 1; else e.repeat += 1;
      acc.set(d, e);
    }
    // Emit EVERY day in the range (zeros included) so the chart has no gaps.
    const SHIFT = 5.5 * 60 * 60 * 1000;
    const key = (t: number) => new Date(t + SHIFT).toISOString().slice(0, 10);
    const days: { day: string; new: number; repeat: number; total: number }[] = [];
    const seen = new Set<string>();
    for (let t = from.getTime(); t <= to.getTime() + 1; t += 86400000) {
      const k = key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = acc.get(k) || { new: 0, repeat: 0 };
      days.push({ day: k, new: e.new, repeat: e.repeat, total: e.new + e.repeat });
    }
    // Range totals are UNIQUE people (a visitor active on 3 days counts once).
    const lo = key(from.getTime()); const hi = key(to.getTime());
    let uNew = 0;
    for (const v of visitors) { const f = firstDay.get(v); if (f && f >= lo && f <= hi) uNew += 1; }
    return {
      range: { from: lo, to: hi },
      days,
      totals: { unique: visitors.length, new: uNew, repeat: Math.max(0, visitors.length - uNew) },
    };
  }

  // CONTACT REPORT — day-wise contact actions, split by channel.
  //
  // Counting rule: ONE count per (visitor, listing, day, channel). Tapping Call
  // on the same shop five times today is one intent, not five; coming back
  // TOMORROW is genuine fresh intent, so it counts again; and contacting three
  // different shops today counts three times.
  //
  // Channel is part of the key on purpose — call and WhatsApp on the same post
  // are two different attempts to reach someone, and the chart splits by channel
  // so collapsing them would make the colours lie.
  async contactReport(from: Date, to: Date): Promise<any> {
    const TZ = 'Asia/Kolkata';
    const dayOf = { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: TZ } };
    const rows: any[] = await this.model.aggregate([
      {
        $match: {
          type: 'contact_click',
          target: { $in: CONTACTED_TARGETS },   // real contact actions only, not "open"/share
          listing_id: { $ne: null },
          ts: { $gte: from, $lte: to },
        },
      },
      // The dedupe itself: collapse repeats within the same day.
      { $group: { _id: { v: '$visitor_id', l: '$listing_id', d: dayOf, t: '$target' } } },
      { $group: { _id: { d: '$_id.d', t: '$_id.t' }, n: { $sum: 1 } } },
    ]);

    const acc = new Map<string, { call: number; whatsapp: number; copy: number }>();
    for (const r of rows) {
      const d = String(r._id.d);
      const e = acc.get(d) || { call: 0, whatsapp: 0, copy: 0 };
      const ch = String(r._id.t) as 'call' | 'whatsapp' | 'copy';
      if (ch in e) e[ch] += r.n;
      acc.set(d, e);
    }
    // Every day in the range, zeros included, so the chart has no gaps.
    const SHIFT = 5.5 * 60 * 60 * 1000;
    const key = (t: number) => new Date(t + SHIFT).toISOString().slice(0, 10);
    const days: any[] = [];
    const seen = new Set<string>();
    for (let t = from.getTime(); t <= to.getTime() + 1; t += 86400000) {
      const k = key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = acc.get(k) || { call: 0, whatsapp: 0, copy: 0 };
      days.push({ day: k, ...e, total: e.call + e.whatsapp + e.copy });
    }
    const totals = days.reduce(
      (a, d) => ({ call: a.call + d.call, whatsapp: a.whatsapp + d.whatsapp, copy: a.copy + d.copy, total: a.total + d.total }),
      { call: 0, whatsapp: 0, copy: 0, total: 0 },
    );
    // How many DIFFERENT people did the contacting, and how many distinct posts
    // got contacted — the two numbers that say whether the total is broad or
    // driven by a handful of users hammering a handful of listings.
    const [people, posts] = await Promise.all([
      this.model.distinct('visitor_id', { type: 'contact_click', target: { $in: CONTACTED_TARGETS }, ts: { $gte: from, $lte: to } }),
      this.model.distinct('listing_id', { type: 'contact_click', target: { $in: CONTACTED_TARGETS }, ts: { $gte: from, $lte: to }, listing_id: { $ne: null } }),
    ]);
    return {
      range: { from: key(from.getTime()), to: key(to.getTime()) },
      days,
      totals: { ...totals, people: people.filter(Boolean).length, posts: posts.filter(Boolean).length },
    };
  }

  // Live posting count for a city (approved + active). The controller inflates it
  // for social proof; the real number never leaves the server.
  async postingsCount(city?: string): Promise<number> {
    const filter: any = { status: 'approved', active: { $ne: false } };
    if (city) filter.city = new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    return this.listings.countDocuments(filter);
  }

  async summary(from: Date, to: Date): Promise<AnalyticsSummary> {
    const match = { ts: { $gte: from, $lte: to } };

    const [
      totals,
      byType,
      byDevice,
      topSearches,
      zeroResults,
      byDay,
      registeredUsers,
      totalPosts,
    ] = await Promise.all([
      this.model.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: 1 }, visitors: { $addToSet: '$visitor_id' }, sessions: { $addToSet: '$session_id' } } },
      ]),
      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$device.type', count: { $sum: 1 } } },
      ]),
      this.model.aggregate([
        { $match: { ...match, type: 'search', query: { $ne: null } } },
        { $group: { _id: { $toLower: '$query' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
      this.model.aggregate([
        { $match: { ...match, type: 'search_zero_results', query: { $ne: null } } },
        { $group: { _id: { $toLower: '$query' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      this.model.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, events: { $sum: 1 }, visitors: { $addToSet: '$visitor_id' } } },
        { $sort: { _id: 1 } },
      ]),
      this.auth.countUsers(),   // all-time registered public users (not range-bound)
      // all-time LIVE posts (approved + not hidden) — the public directory size
      this.listings.countDocuments({ status: 'approved', active: { $ne: false } }),
    ]);

    const t = totals[0] || { total: 0, visitors: [], sessions: [] };
    const toRecord = (rows: any[]) =>
      rows.reduce((acc, r) => { acc[r._id ?? 'unknown'] = r.count; return acc; }, {} as Record<string, number>);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      total_events: t.total,
      unique_visitors: (t.visitors || []).length,
      registered_users: registeredUsers,
      total_posts: totalPosts,
      sessions: (t.sessions || []).length,
      by_type: toRecord(byType),
      device_breakdown: toRecord(byDevice),
      top_searches: topSearches.map((r) => ({ query: r._id, count: r.count })),
      zero_result_searches: zeroResults.map((r) => ({ query: r._id, count: r.count })),
      by_day: byDay.map((r) => ({ day: r._id, events: r.events, visitors: (r.visitors || []).length })),
    };
  }

  // ---- Per-visitor explorer (admin) ----------------------------------------
  // One row per PERSON, not per device: identified users are grouped by their
  // user_id (so all their devices/browsers merge into one row); anonymous ones
  // stay per visitor_id. Newest activity first.
  async visitors(opts: { page?: number; identifiedOnly?: boolean } = {}) {
    const page = Math.max(1, opts.page || 1);
    const match: any = opts.identifiedOnly ? { user_id: { $ne: null } } : {};
    // Group key = user_id when known, else visitor_id → merges a logged-in
    // person's multiple devices into a single row.
    const idKey = { $ifNull: ['$user_id', '$visitor_id'] };
    const grp = {
      $group: {
        _id: idKey,
        any_visitor: { $min: '$visitor_id' },   // a representative device id
        events: { $sum: 1 },
        sessions: { $addToSet: '$session_id' },
        first_seen: { $min: '$ts' },
        last_seen: { $max: '$ts' },
        user_id: { $max: '$user_id' },
        langs: { $addToSet: '$lang' },
        cities: { $addToSet: '$city' },
        devices: { $addToSet: '$device.type' },
        oses: { $addToSet: '$device.os' },
        brands: { $addToSet: '$device.brand' },
        listing_views: { $sum: { $cond: [{ $eq: ['$type', 'listing_view'] }, 1, 0] } },
        contacts: { $sum: { $cond: [{ $eq: ['$type', 'contact_click'] }, 1, 0] } },
        searches: { $sum: { $cond: [{ $eq: ['$type', 'search'] }, 1, 0] } },
      },
    };
    const pipeline: any[] = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });
    pipeline.push(grp, { $sort: { last_seen: -1 } });

    const [rows, totalAgg] = await Promise.all([
      this.model.aggregate([...pipeline, { $skip: (page - 1) * VISITORS_PAGE }, { $limit: VISITORS_PAGE }]),
      this.model.aggregate([...(Object.keys(match).length ? [{ $match: match }] : []), { $group: { _id: idKey } }, { $count: 'n' }]),
    ]);

    const userIds = rows.map((r) => r.user_id).filter(Boolean) as string[];
    const brief = userIds.length ? await this.auth.briefByIds(userIds) : new Map();
    const clean = (arr: any[]) => (arr || []).filter((x) => x != null && x !== '');

    const items = rows.map((r) => {
      const langs = clean(r.langs);
      const brand = clean(r.brands)[0] || null;
      const inc = incomeSignal({ os: clean(r.oses)[0], brand: brand || undefined, lang: langs.includes('en') ? 'en' : 'hi' });
      return {
        id: String(r._id),                       // group key (user_id or visitor_id) — for the drill-in link
        visitor_id: String(r.any_visitor),       // a representative device id (display)
        identified: !!r.user_id,
        user_id: r.user_id || null,
        mobile: r.user_id ? (brief.get(String(r.user_id))?.mobile || null) : null,
        events: r.events,
        sessions: (r.sessions || []).length,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        langs,
        city: clean(r.cities)[0] || null,
        device: clean(r.devices)[0] || null,
        brand,
        income: inc.tier,                         // affluence tier (High / Mid / Low)
        income_score: inc.score,                  // the 0-100 signal behind the tier
        listing_views: r.listing_views,
        contacts: r.contacts,
        searches: r.searches,
      };
    });
    return { page, page_size: VISITORS_PAGE, total: totalAgg[0]?.n || 0, results: items };
  }

  // Deep detail for one visitor: identity + a behavioural summary (languages,
  // categories they browse, contact/share actions, searches, time spent) + a
  // full event timeline. Listing ids are resolved to titles/slugs.
  async visitorDetail(id: string) {
    // `id` is a user_id (identified → all their devices) or a visitor_id (anon).
    const events = await this.model.find({ $or: [{ user_id: id }, { visitor_id: id }] })
      .sort({ ts: 1 }).limit(2000).lean();
    if (!events.length) return null;

    const userId = (events.map((e) => e.user_id).find(Boolean) as string | undefined) || null;
    let mobile: string | null = null, blocked = false;
    if (userId) { const b = (await this.auth.briefByIds([userId])).get(String(userId)); mobile = b?.mobile || null; blocked = !!b?.blocked; }

    const counts: Record<string, number> = {};
    const langCount: Record<string, number> = {};
    const devCount: Record<string, number> = {};
    const osCount: Record<string, number> = {};
    const brandCount: Record<string, number> = {};
    const citySet = new Set<string>();
    const bySession: Record<string, number[]> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.lang) langCount[e.lang] = (langCount[e.lang] || 0) + 1;
      const dt = (e.device as any)?.type;
      if (dt) devCount[dt] = (devCount[dt] || 0) + 1;
      const dos = (e.device as any)?.os; if (dos) osCount[dos] = (osCount[dos] || 0) + 1;
      const dbr = (e.device as any)?.brand; if (dbr) brandCount[dbr] = (brandCount[dbr] || 0) + 1;
      if (e.city) citySet.add(e.city);
      (bySession[e.session_id] = bySession[e.session_id] || []).push(new Date(e.ts).getTime());
    }
    let engaged = 0;
    for (const k of Object.keys(bySession)) { const ts = bySession[k]; engaged += Math.max(...ts) - Math.min(...ts); }

    // Resolve any listings the visitor touched (views + contacts).
    const listingIds = [...new Set(events.filter((e) => e.listing_id).map((e) => String(e.listing_id)))];
    const listings = listingIds.length
      ? await this.listings.find({ _id: { $in: listingIds } }, { title: 1, category: 1, kind: 1, post_type: 1, slug: 1, city: 1 }).lean()
      : [];
    const lmap = new Map(listings.map((l) => [String(l._id), l as any]));

    // Dwell = time until the next event in the same session (capped).
    const DWELL_CAP = 300, DWELL_MIN = 15;
    const dwellAt = (i: number): number => {
      const cur = events[i], nxt = events[i + 1];
      if (nxt && nxt.session_id === cur.session_id) {
        const d = (new Date(nxt.ts).getTime() - new Date(cur.ts).getTime()) / 1000;
        return Math.min(Math.max(d, 0), DWELL_CAP);
      }
      return DWELL_MIN;   // last event in the session — they at least opened it
    };

    // "Interested in" = a POINTS model across every signal, bucketed by category
    // (business) or kind/post_type (jobs/sell/etc.) so non-category posts count
    // too. Points: viewing (time-weighted) < sharing < contacting < posting.
    // (bucketOf + CONTACT_PTS are module-level — shared with registeredUsers.)
    const interest: Record<string, { label: string; points: number }> = {};
    const addPts = (l: any, pts: number) => {
      const b = bucketOf(l); if (!b || pts <= 0) return;
      const e = (interest[b.key] = interest[b.key] || { label: b.label, points: 0 });
      e.points += pts;
    };
    events.forEach((e, i) => {
      const l = e.listing_id ? lmap.get(String(e.listing_id)) : null;
      if (!l) return;
      if (e.type === 'listing_view') addPts(l, 3 + Math.min(dwellAt(i) / 60, 5) * 6);       // time on the post
      else if (e.type === 'contact_click') addPts(l, CONTACT_PTS[String(e.target)] ?? 8);    // call/whatsapp/share…
    });
    // What they POST is the strongest interest signal — add their own listings.
    if (userId) {
      const own = await this.listings.find({ posted_by_user_id: userId }, { category: 1, kind: 1, post_type: 1 }).lean();
      for (const l of own) addPts(l, 40);
    }
    const searchMap: Record<string, { query: string; count: number; zero: boolean }> = {};
    for (const e of events) {
      if (e.type === 'search' && e.query) {
        const q = String(e.query).toLowerCase();
        const s = (searchMap[q] = searchMap[q] || { query: q, count: 0, zero: false });
        s.count++; if ((e.result_count || 0) === 0) s.zero = true;
      }
    }
    const withListing = (e: any) => { const l = e.listing_id ? lmap.get(String(e.listing_id)) : null; return { title: l?.title || null, slug: l?.slug || null }; };
    const actions = events.filter((e) => e.type === 'contact_click').slice(-100).reverse()
      .map((e) => ({ ts: e.ts, target: e.target, listing_id: e.listing_id, ...withListing(e) }));
    const timeline = events.slice(-300).reverse()
      .map((e) => ({ ts: e.ts, type: e.type, path: e.path, target: e.target, query: e.query, result_count: e.result_count, listing_id: e.listing_id, lang: e.lang, city: e.city, ...withListing(e) }));

    // Latest language selected + city currently being browsed (most recent event).
    let lastLang: string | null = null, currentCity: string | null = null;
    for (let i = events.length - 1; i >= 0 && (!lastLang || !currentCity); i--) {
      if (!lastLang && events[i].lang) lastLang = events[i].lang;
      if (!currentCity && events[i].city) currentCity = events[i].city;
    }

    // Where they FIRST landed (entry page) + external referrer. If the landing
    // path is a listing, resolve its title/slug so the admin can click through.
    const first = events[0];
    const entryPath = String(first.path || '/').split('?')[0];
    let entryListing: any = null;
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const RESERVED = new Set(['business', 'job-opening', 'job-seeker', 'happening', 'sell', 'rent', 'other', 'cat', 'admin', 'post', 'my', 'categories', 'l']);
    const segs = entryPath.split('/').filter(Boolean);
    try {
      if (segs[0] === 'l' && segs[1] && /^[a-f0-9]{24}$/i.test(segs[1])) {
        entryListing = await this.listings.findOne({ _id: segs[1] }, { title: 1, slug: 1, city: 1, hide_title: 1 }).lean();
      } else if (segs.length === 2 && !RESERVED.has(segs[1].toLowerCase())) {
        entryListing = await this.listings.findOne({ slug: new RegExp('^' + escRe(segs[1]) + '$', 'i') }, { title: 1, slug: 1, city: 1, hide_title: 1 }).lean();
      }
    } catch { /* ignore */ }
    const entry = {
      path: entryPath || '/',
      referrer: first.referrer || '',
      ts: first.ts,
      listing_id: entryListing ? String(entryListing._id) : null,
      title: entryListing ? maskTitle(entryListing.title, entryListing.hide_title) : null,
      slug: entryListing?.slug || null,
    };

    const sorted = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count);
    const topCats = Object.values(interest).map((x: any) => ({ label: x.label, points: Math.round(x.points) })).sort((a, b) => b.points - a.points);
    // Affluence estimate from device + language + strongest interest.
    const topOs = sorted(osCount)[0]?.key;
    const topBrand = sorted(brandCount)[0]?.key;
    const inc = incomeSignal({ os: topOs, brand: topBrand, lang: (lastLang === 'en' || langCount['en']) ? 'en' : 'hi', topLabel: topCats[0]?.label });
    const income = { tier: inc.tier, score: inc.score, brand: topBrand || null, os: topOs || null };
    return {
      visitor_id: id,
      identified: !!userId,
      user_id: userId,
      mobile,
      blocked,
      first_seen: events[0].ts,
      last_seen: events[events.length - 1].ts,
      total_events: events.length,
      sessions: Object.keys(bySession).length,
      engaged_seconds: Math.round(engaged / 1000),
      counts,
      languages: sorted(langCount),
      last_lang: lastLang,
      devices: sorted(devCount),
      cities: [...citySet],
      current_city: currentCity,
      entry,
      income,
      top_categories: topCats,
      searches: Object.values(searchMap).sort((a, b) => b.count - a.count),
      actions,
      timeline,
    };
  }
}
