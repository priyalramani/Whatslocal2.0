import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { getListing, getListingBySlug, revealPhone, reportListing, searchListings } from '../lib/listings';
import { ListingTile } from './ListingCard';
import { listingPath, cityNameToSlug, KIND_TO_SLUG, setLastCity } from '../lib/city';
import { CATEGORY_BY_LABEL } from '@whatslocal/types';
import { track } from '../lib/analytics';
import { verticalOf, setLastListing, getRecentViews } from '../lib/recentView';
import { fmtTime } from './WeekHours';
import { iconFor, categoryLabel, catLabel, catSlug, typeTag } from '../lib/listingMeta';
import { WhatsAppIcon } from './WhatsAppIcon';
import { BottomNav } from './BottomNav';
import { currentUser } from '../lib/auth';
import { currentSession } from '../lib/userAuth';
import { useT } from '../lib/i18n';
import { mediaUrl } from '../lib/api';
import { BRAND } from '../lib/brand';
import { OtpLogin } from './OtpLogin';

const REASONS = [
  { v: 'wrong_info', k: 'reason.wrong_info' }, { v: 'scam', k: 'reason.scam' },
  { v: 'spam', k: 'reason.spam' }, { v: 'duplicate', k: 'reason.duplicate' },
  { v: 'offensive', k: 'reason.offensive' }, { v: 'other', k: 'reason.other' },
];
const DAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The category-browse page a listing belongs to — where a shared-link visitor
// lands on Back (e.g. a job opening → Jobs › Openings, a used bike → Buy-sell ›
// Bikes). The category is a PATH segment so the landing is a real shareable URL.
function categoryUrlFor(l: PublicListing, citySlug: string): string {
  if (l.kind === 'job_opening') return `/${citySlug}/browse/jobs/openings`;
  if (l.kind === 'job_seeker') return `/${citySlug}/browse/jobs/seekers`;
  if (l.kind === 'happening' || l.post_type === 'happening') return `/${citySlug}/browse/happening`;
  const cat = (l.categories?.[0] || l.category || '') as string;
  if (l.post_type === 'sell' || l.post_type === 'other') {
    return `/${citySlug}/browse/sell${cat ? '/' + catSlug(cat) : ''}${l.sale_or_rent === 'rent' ? '?deal=rent' : ''}`;
  }
  return `/${citySlug}/browse/business${cat ? '/' + catSlug(cat) : ''}`;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="relative w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">{children}</div>
    </div>
  );
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white border border-slate-100 shadow-card ${className}`}>{children}</div>;
}
function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-[13px] text-slate-400 shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

export function ListingDetail() {
  // Reached two ways: legacy /l/:id (id set) or the readable /:city/:kind
  // permalink (the `kind` param then holds the listing's slug).
  const { id = '', kind: slugParam = '' } = useParams();
  const nav = useNavigate();
  const { t, lang } = useT();
  const [l, setL] = useState<PublicListing | null>(null);
  const [err, setErr] = useState('');

  const [phone, setPhone] = useState<string | null>(null);
  const [waNum, setWaNum] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  // Drag-to-dismiss for the contact bottom-sheet (so the handle works and a
  // swipe-down never falls through to the browser's pull-to-refresh).
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('wrong_info');
  const [details, setDetails] = useState('');
  const [reported, setReported] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<'report' | 'contact'>('report');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [related, setRelated] = useState<PublicListing[]>([]);
  const [jobGuard, setJobGuard] = useState(false);   // "Calling for a job?" sheet

  useEffect(() => {
    (slugParam ? getListingBySlug(slugParam) : getListing(id))
      .then((d) => {
        setL(d);
        // Stamp the vertical + category so this view feeds vertical affinity even
        // though the permalink path doesn't encode it — this is what gives a
        // shared-link visitor an interest from their very first touch.
        track('listing_view', { listing_id: d._id, vertical: verticalOf(d), category: (d.categories?.[0] || d.category || '') });
        setLastListing(d);   // seed for the home feed's "more like what you saw" rail
        // Opening a post switches the visitor's active city to that post's city
        // (so back lands on that city's home, and the next bare-URL visit too).
        if (d.city) {
          setLastCity({ slug: cityNameToSlug(d.city), name: d.city, pincode: (d as any).pincode || '' });
        }
      })
      .catch((e) => setErr(e?.message || 'Not found'));
  }, [id, slugParam]);

  // Related listings — ONLY the same category (business) / kind (jobs) /
  // post-type, in the same city, excluding this one. Hidden if none.
  useEffect(() => {
    if (!l?.city) { setRelated([]); return; }
    const jobKind = (l.kind === 'job_opening' || l.kind === 'job_seeker') ? l.kind : undefined;
    const filters: any = {};
    if (l.post_type === 'sell' || l.post_type === 'other') filters.post_type = l.post_type;
    else if (!jobKind && (l.categories?.[0] || l.category)) filters.category = l.categories?.[0] || l.category;
    let cancelled = false;
    (async () => {
      try {
        const r = await searchListings('', l.city, jobKind, 1, filters);
        const items = (r.results || []).filter((x) => x._id !== l._id).slice(0, 6);
        if (!cancelled) setRelated(items);
      } catch { if (!cancelled) setRelated([]); }
    })();
    return () => { cancelled = true; };
  }, [l?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared-link landing: keep Back inside the app AND land on the listing's
  // category page. With no in-app history (idx 0), push a guard entry so the
  // first Back — hardware, or the in-app ← which calls history.back() — fires a
  // popstate we catch and route to e.g. Jobs › Hiring.
  useEffect(() => {
    if (!l) return;
    const st = window.history.state as any;
    const idx = (st && typeof st.idx === 'number') ? st.idx : 0;
    if (idx > 0) return; // arrived via in-app navigation → normal Back already works
    const cat = categoryUrlFor(l, cityNameToSlug(l.city));
    window.history.pushState(st, '');
    const onPop = () => nav(cat, { replace: true });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [l?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Frame><div className="p-8 text-center text-slate-400">{err}<div className="mt-4"><Link to="/" className="text-brand">← Back</Link></div></div></Frame>;
  if (!l) return <Frame><div className="p-8 text-center text-slate-400">Loading…</div></Frame>;

  const adminUser = currentUser();
  // The route param may be a slug, so always use the loaded doc's real _id for
  // API calls (reveal/report), analytics, and edit links.
  const lid = l._id;
  const callOk = l.call_ok !== false, waOk = l.whatsapp_ok !== false;
  const isJob = l.kind === 'job_opening' || l.kind === 'job_seeker';
  const loc = [l.city, l.state].filter(Boolean).join(', ');
  const salary = (l.salary_min || l.salary_max) ? `₹${l.salary_min ?? ''}${l.salary_max ? ' – ₹' + l.salary_max : '+'}` : '';
  const JT: Record<string, string> = { full_time: 'opt.fullTime', part_time: 'opt.partTime', contract: 'opt.contract', internship: 'opt.internship' };
  const GEN: Record<string, string> = { male: 'opt.male', female: 'opt.female', other: 'opt.other', both: 'opt.both' };
  const MAR: Record<string, string> = { single: 'opt.single', married: 'opt.married', divorced: 'opt.divorced', widowed: 'opt.widowed' };
  const HT: Record<string, string> = { event: 'hap.event', news: 'hap.news', info: 'hap.info' };
  const tg = (v?: string | null) => (v && GEN[v] ? t(GEN[v]) : (v || undefined));
  const tmar = (v?: string | null) => (v && MAR[v] ? t(MAR[v]) : undefined);
  const tjt = (v?: string | null) => (v && JT[v] ? t(JT[v]) : undefined);
  const hasDetails = !!(
    salary || l.price != null || (l.job_type && JT[l.job_type]) || l.expected_salary ||
    (l.gender_required && l.gender_required !== 'both') || l.gender || l.age ||
    l.experience_required_months || l.experience_months != null || l.languages?.length ||
    l.address || l.event_date || l.happening_type || l.experience_description || l.sale_or_rent
  );
  // Fields parked under the "More details" toggle (jobs only).
  const hasMoreDetails =
    l.kind === 'job_opening'
      ? !!((l.job_type && JT[l.job_type]) || l.gender_required || l.age_min || l.age_max || l.languages?.length)
      : l.kind === 'job_seeker'
        ? !!(l.expected_salary || (l.job_type && JT[l.job_type]) || l.languages?.length || l.experience_description)
        : false;

  // "Open now" from today's schedule + current time.
  const today = DAYS_ABBR[new Date().getDay()];
  const toMin = (s?: string) => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const todaySched = l.week_hours?.find((d) => d.day === today);
  const openNow = !!todaySched?.open && (() => {
    const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= toMin(todaySched!.from) && cur <= toMin(todaySched!.to);
  })();

  // Job seekers browsing openings often call SHOPS asking for work, which spams
  // businesses. Ask once (this session) before revealing a shop's number, and
  // route them to real openings instead. Only job seekers see this — someone
  // viewing candidate profiles (an employer) or a normal visitor never does.
  function shouldAskJobGuard(): boolean {
    const lst = l as PublicListing | null;
    if (!lst || verticalOf(lst) !== 'business') return false;
    try { if (sessionStorage.getItem('wl_jobguard_off')) return false; } catch { return false; }
    return getRecentViews().filter((v) => v.kind === 'job_opening').length >= 2;
  }

  async function openContact(force = false) {
    setNote(null); setCopied(false);
    if (!force && shouldAskJobGuard()) { setJobGuard(true); return; }
    if (phone) { setDrawer(true); return; }
    setBusy(true);
    try {
      const r = await revealPhone(lid);
      // The server resolves each channel to its real number. A call-less listing
      // returns no `mobile`, so fall back to the WhatsApp one — otherwise Copy
      // would have nothing to copy and would silently do nothing.
      setPhone(r.mobile || r.whatsapp); setWaNum(r.whatsapp || null);
      setDrawer(true); track('contact_click', { listing_id: lid, target: 'open' });
    }
    catch (e: any) {
      // Free anonymous limit reached → prompt registration right here, then retry.
      if (e?.code === 'LOGIN_REQUIRED') {
        // The SERVER says this request wasn't authenticated — no token, or a
        // stale/expired one. Always open the login popup: if we trusted the
        // client's own session flag here, a user with an expired token would be
        // dead-ended on a tiny note they can't act on.
        setLoginReason('contact'); setLoginOpen(true);
      } else if (e?.code === 'DAILY_LIMIT' || /daily limit/i.test(e?.message)) setNote(t('detail.dailyLimit'));
      else setNote(e?.message || 'Could not load contact.');
    } finally { setBusy(false); }
  }
  // The WhatsApp opener is written per category so the RECEIVER can tell at a
  // glance which of their posts this is about and what's being asked — a bare
  // "I'm interested" makes them ask twice. An offer beats the base category,
  // since that's the specific thing the sender is reacting to.
  function waOpener(): string {
    const lst = l as PublicListing;
    const v = verticalOf(lst);
    const key =
      lst.offer_text ? 'wa.msg.offer'
        : lst.kind === 'job_opening' ? 'wa.msg.hiring'
          : lst.kind === 'job_seeker' ? 'wa.msg.seeker'
            : v === 'happening' ? 'wa.msg.event'
              : v === 'rent' ? 'wa.msg.rent'
                : v === 'sell' ? 'wa.msg.sell'
                  : 'wa.msg.business';
    return t(key, { title: lst.title || '', brand: BRAND.displayName, city: lst.city || '' });
  }
  function pick(target: 'call' | 'whatsapp' | 'copy') {
    if (!phone) return;
    track('contact_click', { listing_id: lid, target });
    if (target === 'call') window.location.href = `tel:${phone}`;
    else if (target === 'whatsapp') {
      window.open(`https://wa.me/91${waNum || phone}?text=${encodeURIComponent(waOpener())}`, '_blank', 'noopener');
    }
    else { navigator.clipboard?.writeText(phone).catch(() => {}); setCopied(true); }
  }
  // Bottom-sheet drag-to-dismiss.
  function sheetDragStart(e: React.TouchEvent) { dragStart.current = e.touches[0].clientY; }
  function sheetDragMove(e: React.TouchEvent) {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    setDragY(dy > 0 ? dy : 0);
  }
  function sheetDragEnd() {
    const close = dragY > 90;
    dragStart.current = null;
    setDragY(0);
    if (close) setDrawer(false);
  }
  // Reporting requires login — open the login popup first if logged out.
  function startReport() {
    if (!currentSession()) { setLoginReason('report'); setLoginOpen(true); return; }
    setReporting(true);
  }
  async function submitReport() {
    try { await reportListing(lid, reason, details); } catch { /* ignore */ }
    setReported(true); setReporting(false);
  }

  const ctaCls = 'block w-full text-center rounded-2xl border-2 border-brand text-brand font-semibold py-3 hover:bg-brand/5 transition';

  // Quick actions: Home, and "More <category/kind>" → the relevant browse page.
  const citySlug = cityNameToSlug(l.city);
  const catKey = l.category ? CATEGORY_BY_LABEL[l.category]?.key : undefined;
  const moreTo = l.kind === 'business'
    ? (catKey ? `/${citySlug}/cat/${catKey}` : `/${citySlug}`)
    : `/${citySlug}/${KIND_TO_SLUG[l.kind] || l.kind}`;
  const moreLabel = l.kind === 'business'
    ? (catLabel(categoryLabel(l), lang).split('/')[0].trim() || 'Listings')
    : t(`kind.${l.kind}`);
  const moreEmoji = l.kind === 'business' ? iconFor(l)
    : l.kind === 'job_opening' ? '💼' : l.kind === 'job_seeker' ? '🙋' : '🎉';

  // Share a rich WhatsApp-ready message: icon + title + sub + meta + the link.
  // `L` is the non-null listing captured for use inside this closure (TS won't
  // narrow the `l` state var here).
  const L = l;
  async function doShare() {
    // A ?s=<edit-version> makes an EDITED post a "new" URL to WhatsApp, so it
    // re-crawls and shows the updated preview instead of its cached old one. The
    // SPA + OG renderer both ignore the query, so the link still resolves cleanly.
    const ver = (L as any).updatedAt ? new Date((L as any).updatedAt).getTime().toString(36) : '';
    const url = `${location.origin}${listingPath(L)}${ver ? `?s=${ver}` : ''}`;
    // Top block (drop empty fields), then a blank line, a bold "Details:" label,
    // and the link on its own line.
    const top = [
      `${iconFor(L)} *${L.title}*`,
      L.short_desc || '',
      categoryLabel(L) ? `📂 ${catLabel(categoryLabel(L), lang)}` : '',
      loc ? `📍 ${loc}` : '',
      salary ? `💰 ${salary}` : (L.price != null ? `💰 ₹${L.price}` : ''),
    ].filter((x) => x !== '').join('\n');
    const text = `${top}\n\n*${t('share.details')}*\n👉 ${url}`;
    track('contact_click', { listing_id: lid, target: 'share' });
    try {
      if (navigator.share) { await navigator.share({ title: L.title, text }); return; }
    } catch { return; }   // user dismissed the share sheet
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  // Smart back: a visitor who browsed here in-app goes back normally. A shared-
  // link visitor (no in-app history) is instead routed to THIS listing's
  // category page — history.back() fires the guard popstate above, which lands
  // them on e.g. Jobs › Hiring instead of dropping out of the app.
  function goBack() {
    const idx = (window.history.state && typeof window.history.state.idx === 'number') ? window.history.state.idx : 0;
    if (idx > 0) nav(-1);
    else if (window.history.length > 1) window.history.back();
    else nav(categoryUrlFor(L, citySlug), { replace: true });
  }

  // Job-guard outcomes: Yes → real openings; No → remember and reveal as normal.
  function guardYes() {
    track('contact_click', { listing_id: lid, target: 'jobguard_yes' });
    setJobGuard(false);
    nav(`/${citySlug}/browse/jobs/openings?note=hiring`);
  }
  function guardNo() {
    try { sessionStorage.setItem('wl_jobguard_off', '1'); } catch { /* ignore */ }
    track('contact_click', { listing_id: lid, target: 'jobguard_no' });
    setJobGuard(false);
    openContact(true);
  }


  return (
    <Frame>
      {/* ===== Hero ===== */}
      <div className="bg-gradient-to-br from-brand to-brand-dark text-white px-5 pt-3 pb-9 rounded-b-[28px] shadow-lg">
        <div className="flex items-center justify-between">
          <button onClick={goBack} aria-label="Back"
            className="h-9 w-9 -ml-1.5 rounded-full hover:bg-white/15 active:scale-95 flex items-center justify-center text-xl transition">←</button>
          {(adminUser?.role === 'admin' || l.can_edit) && (
            <Link to={adminUser?.role === 'admin' ? `/admin/listings/${lid}` : `/edit/${lid}`}
              className="text-sm font-medium bg-white/15 rounded-full px-4 py-1.5 hover:bg-white/25 transition">Edit</Link>
          )}
        </div>
        <div className="flex items-start gap-3.5 mt-3">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-md">{iconFor(l)}</div>
          <div className="min-w-0 pt-0.5">
            {/* Type chip — makes "this is a shop, not a job post" unmistakable. */}
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1 ${typeTag(l).cls}`}>{t(typeTag(l).labelKey)}</span>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{catLabel(categoryLabel(l), lang)}</div>
            <h1 className="text-xl font-bold leading-tight mt-0.5 break-words">{l.title}</h1>
            {loc && <div className="text-sm text-white/80 mt-1">📍 {loc}</div>}
          </div>
        </div>
        {l.job_role && <div className="inline-block mt-3 text-sm bg-white/15 rounded-full px-3.5 py-1">{l.job_role}</div>}
      </div>

      {/* ===== Body ===== */}
      <main className="flex-1 px-4 pb-44 -mt-4 space-y-3">
        {/* Photos — cover on top; a thumb row below swaps the main image on tap. */}
        {!!l.photos?.length && (
          <Card className="overflow-hidden">
            <img src={mediaUrl(l.photos[Math.min(photoIdx, l.photos.length - 1)], 'view')}
              alt={l.title} loading="lazy"
              className="w-full max-h-[360px] object-contain bg-slate-50" />
            {l.photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar p-2">
                {l.photos.map((k, i) => (
                  <button key={k} type="button" onClick={() => setPhotoIdx(i)}
                    className={`h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition ${i === photoIdx ? 'border-brand' : 'border-transparent'}`}>
                    <img src={mediaUrl(k, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {(l.short_desc || l.description) && (
          <Card className="p-4">
            {l.short_desc && <p className="text-sm font-semibold text-slate-800">{l.short_desc}</p>}
            {l.description && <p className={`text-sm leading-relaxed text-slate-600 whitespace-pre-line ${l.short_desc ? 'mt-2' : ''}`}>{l.description}</p>}
          </Card>
        )}

        {/* Details */}
        {hasDetails && (
          <Card className="px-4">
            <div className="text-[13px] font-semibold text-slate-800 pt-3.5 pb-1">{t('detail.details')}</div>
            {isJob && l.kind === 'job_opening' && <>
              <Detail label={t('row.location')} value={l.address} />
              <Detail label={t('row.salary')} value={salary} />
              <Detail label={t('row.experience')} value={l.experience_required_months ? t('row.months', { n: l.experience_required_months }) : undefined} />
              {!l.week_hours?.length && <Detail label={t('row.timing')} value={l.job_timing || l.working_days} />}
              {showMore && <>
                <Detail label={t('row.jobType')} value={tjt(l.job_type)} />
                <Detail label={t('row.age')} value={l.age_min && l.age_max ? `${l.age_min}–${l.age_max}` : l.age_min ? `${l.age_min}+` : l.age_max ? `≤ ${l.age_max}` : undefined} />
                <Detail label={t('row.gender')} value={l.gender_required ? (l.gender_required === 'both' ? t('val.any') : tg(l.gender_required)) : undefined} />
                <Detail label={t('row.languages')} value={l.languages?.length ? l.languages.join(', ') : undefined} />
              </>}
            </>}
            {isJob && l.kind === 'job_seeker' && <>
              <Detail label={t('row.location')} value={l.address} />
              <Detail label={t('row.age')} value={l.age ? t('row.yrs', { n: l.age }) : undefined} />
              <Detail label={t('row.gender')} value={tg(l.gender)} />
              <Detail label={t('row.marital')} value={tmar(l.marital_status)} />
              <Detail label={t('row.experience')} value={l.experience_months != null ? t('row.months', { n: l.experience_months }) : undefined} />
              {showMore && <>
                <Detail label={t('row.expectedSalary')} value={l.expected_salary ? `₹${l.expected_salary}` : undefined} />
                <Detail label={t('row.jobType')} value={tjt(l.job_type)} />
                <Detail label={t('row.languages')} value={l.languages?.length ? l.languages.join(', ') : undefined} />
                <Detail label={t('row.about')} value={l.experience_description} />
              </>}
            </>}
            {!isJob && <>
              {l.post_type === 'sell' && <>
                <Detail label={t('row.price')} value={l.price != null
                  ? `₹${l.price}${l.sale_or_rent === 'rent' && l.rent_period ? ` · ${l.rent_period}` : ''}${l.negotiable ? ' (negotiable)' : ''}`
                  : undefined} />
                <Detail label={t('row.type')} value={l.sale_or_rent === 'rent' ? t('val.forRent') : l.sale_or_rent === 'sale' ? t('val.forSale') : undefined} />
                {l.sale_or_rent === 'rent' && <Detail label={t('row.rentPeriod')} value={l.rent_period || undefined} />}
              </>}
              {l.post_type === 'happening' && <>
                <Detail label={t('row.when')} value={l.event_date} />
                <Detail label={t('row.type')} value={l.happening_type ? (HT[l.happening_type] ? t(HT[l.happening_type]) : l.happening_type) : undefined} />
              </>}
              <Detail label={t('row.address')} value={l.address} />
            </>}

            {isJob && hasMoreDetails && (
              <button type="button" onClick={() => setShowMore((m) => !m)}
                className="w-full text-center text-sm font-semibold text-brand py-3 border-t border-slate-100">
                {showMore ? t('detail.less') : t('detail.more')}
              </button>
            )}
          </Card>
        )}

        {/* Working hours */}
        {!!l.week_hours?.length && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[13px] font-semibold text-slate-800">{t('detail.hours')}</div>
              <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${openNow ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                {openNow ? t('detail.openNow') : t('detail.closedNow')}
              </span>
            </div>
            {l.week_hours.map((d) => {
              const isToday = d.day === today;
              return (
                <div key={d.day} className={`flex justify-between text-sm py-2 border-b border-slate-50 last:border-0 ${isToday ? 'font-semibold' : ''}`}>
                  <span className={isToday ? 'text-brand' : 'text-slate-500'}>{d.day}{isToday && ` · ${t('detail.today')}`}</span>
                  <span className={d.open ? (isToday ? 'text-slate-900' : 'text-slate-700') : 'text-slate-300'}>
                    {d.open ? `${fmtTime(d.from)} – ${fmtTime(d.to)}` : t('detail.holiday')}
                  </span>
                </div>
              );
            })}
          </Card>
        )}

        {/* User-defined CTA buttons (http(s)-only, validated server-side) */}
        {l.cta_label && l.cta_url && (
          <a href={l.cta_url} target="_blank" rel="noopener noreferrer"
            onClick={() => track('contact_click', { listing_id: lid, target: 'cta' })} className={ctaCls}>
            {l.cta_label}
          </a>
        )}
        {l.cta_label2 && l.cta_url2 && (
          <a href={l.cta_url2} target="_blank" rel="noopener noreferrer"
            onClick={() => track('contact_click', { listing_id: lid, target: 'cta2' })} className={ctaCls}>
            {l.cta_label2}
          </a>
        )}

        {/* More in this city — fills the page with relevant, tappable listings. */}
        {related.length > 0 && (
          <div className="pt-2">
            <div className="text-[13px] font-semibold text-slate-700 px-1 mb-2.5">{t('detail.moreOf', { label: moreLabel })}</div>
            <div className="grid grid-cols-3 gap-2">
              {related.map((r) => <ListingTile key={r._id} full listing={r} />)}
            </div>
          </div>
        )}

        {/* Report */}
        {reporting ? (
          <Card className="p-3.5 space-y-2">
            <div className="text-xs font-medium text-slate-600">{t('detail.reportWhy')}</div>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
              {REASONS.map((r) => <option key={r.v} value={r.v}>{t(r.k)}</option>)}
            </select>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder={t('detail.reportDetails')} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setReporting(false)} className="text-xs text-slate-400 px-2">{t('common.cancel')}</button>
              <button onClick={submitReport} className="rounded-lg bg-brand text-white text-xs px-3 py-1.5">{t('common.submit')}</button>
            </div>
          </Card>
        ) : reported ? (
          <div className="text-xs text-green-600 text-center py-1">{t('detail.reported')}</div>
        ) : (
          <button onClick={startReport} className="w-full text-xs text-slate-400 py-1">{t('detail.report')}</button>
        )}
      </main>

      {loginOpen && (
        <OtpLogin title={loginReason === 'contact' ? t('detail.registerToView') : t('detail.loginToReport')}
          onSuccess={() => { setLoginOpen(false); if (loginReason === 'contact') openContact(); else setReporting(true); }}
          onClose={() => setLoginOpen(false)} />
      )}

      {/* ===== Sticky contact bar — sits just above the bottom footer ===== */}
      <div className="fixed bottom-[52px] left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/90 backdrop-blur border-t border-slate-100 px-4 pt-2.5 pb-2.5 z-30">
        {note && <div className="text-xs text-amber-600 mb-2 text-center">{note}</div>}
        {/* Primary: Contact (full width). Secondary pair below: Share · More. */}
        <button onClick={() => openContact()} disabled={busy || !l.has_phone}
          className="w-full rounded-xl bg-brand text-white font-semibold py-3 hover:bg-brand-dark active:scale-[.99] disabled:opacity-50 shadow-card flex items-center justify-center gap-2 transition">
          {busy ? t('common.loading') : l.has_phone ? t('detail.contact') : t('detail.noContact')}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={doShare}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-600 active:scale-[.98] transition">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 17 20 12 15 7" />
              <path d="M4 18v-1a5 5 0 0 1 5-5h11" />
            </svg>
            {t('detail.share')}
          </button>
          <Link to={moreTo}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-600 active:scale-[.98] transition">
            <span className="text-base leading-none">{moreEmoji}</span>
            <span className="truncate">{t('detail.moreOf', { label: moreLabel })}</span>
          </Link>
        </div>
      </div>

      {/* "Calling for a job?" — job seekers only, before a shop's number shows. */}
      {jobGuard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setJobGuard(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-7" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-2xl">💼</span>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 leading-snug">{t('guard.q')}</div>
                <div className="text-[13px] text-slate-500 mt-0.5">{t('guard.sub')}</div>
              </div>
            </div>
            <button onClick={guardYes}
              className="mt-5 w-full rounded-xl bg-brand text-white font-semibold py-3 hover:bg-brand-dark active:scale-[.99] transition">{t('guard.yes')}</button>
            <button onClick={guardNo}
              className="mt-2.5 w-full rounded-xl border border-slate-200 text-slate-500 font-medium py-3 active:scale-[.99] transition">{t('guard.no')}</button>
          </div>
        </div>
      )}

      {/* Contact bottom-sheet — number never shown */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-7 touch-none"
            style={{ transform: `translateY(${dragY}px)`, transition: dragStart.current == null ? 'transform .25s ease' : 'none' }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={sheetDragStart} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="text-base font-semibold text-slate-900 mb-0.5">{l.title}</div>
            <div className="text-xs text-slate-400 mb-4">{t('detail.connect')}</div>
            <div className="space-y-2.5">
              {callOk && (
                <button onClick={() => pick('call')} className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 hover:bg-slate-50 active:scale-[.99] transition">
                  <span className="h-9 w-9 rounded-full bg-brand/10 flex items-center justify-center text-lg">📞</span>
                  <span className="font-semibold text-slate-800">{t('detail.call')}</span>
                </button>
              )}
              {waOk && (
                <button onClick={() => pick('whatsapp')} className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 hover:bg-slate-50 active:scale-[.99] transition">
                  <WhatsAppIcon className="h-9 w-9 shrink-0" />
                  <span className="font-semibold text-green-600">{t('detail.whatsapp')}</span>
                </button>
              )}
              <button onClick={() => pick('copy')} className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 hover:bg-slate-50 active:scale-[.99] transition">
                <span className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-lg">📋</span>
                <span className="font-semibold text-slate-800">{copied ? t('detail.copied') : t('detail.copy')}</span>
              </button>
            </div>
            <button onClick={() => setDrawer(false)} className="mt-4 w-full text-sm text-slate-400 py-2">{t('common.close')}</button>
          </div>
        </div>
      )}

      <BottomNav />
    </Frame>
  );
}
