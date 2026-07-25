import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { searchListings } from '../lib/listings';
import { KIND_INFO } from '../lib/listingMeta';
import { resolveCity, SLUG_TO_KIND } from '../lib/city';
import { useSmartBack } from '../lib/useSmartBack';
import { ListingCard } from './ListingCard';
import { BottomNav } from './BottomNav';
import { useT } from '../lib/i18n';

// Filter selections → query params for /listings/search.
type Sel = { gender: string; age: string; exp: string; sal: string };
const EMPTY: Sel = { gender: '', age: '', exp: '', sal: '' };
function toFilters(s: Sel): Record<string, any> {
  const f: Record<string, any> = {};
  if (s.gender) f.gender = s.gender;
  if (s.age) {
    if (s.age === '45') f.age_min = 45;
    else { const [a, b] = s.age.split('-'); f.age_min = a; f.age_max = b; }
  }
  if (s.exp) { if (s.exp === 'fresher') f.exp_max = 0; else f.exp_min = s.exp; }
  if (s.sal) f.sal_min = s.sal;
  return f;
}

const sel = 'rounded-full border border-slate-200 bg-white text-xs px-3 py-1.5 text-slate-600 shadow-sm';
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-400">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryPage() {
  const { city: citySlug, kind: kindSlug = '' } = useParams();
  const { t } = useT();
  const city = resolveCity(citySlug);
  const back = useSmartBack(`/${city.slug}`);
  // A post_type browse (sell / rent / other) is NOT a listing kind: we filter by
  // post_type (+ sale_or_rent for sell/rent), show no job filters, label from *Sec.*.
  const isSaleBrowse = kindSlug === 'sell' || kindSlug === 'rent';   // both are post_type=sell
  const isPtype = isSaleBrowse || kindSlug === 'other';
  const kind = isPtype ? '' : (SLUG_TO_KIND[kindSlug] || kindSlug);
  const info = isSaleBrowse
    ? { label: t(kindSlug === 'rent' ? 'saleSec.rent' : 'saleSec.sale'), emoji: kindSlug === 'rent' ? '🔑' : '🏷️' }
    : kindSlug === 'other'
      ? { label: t('ptypeSec.other'), emoji: '📦' }
      : (KIND_INFO[kind] || { label: 'Listings', emoji: '📋' });
  const isSeeker = kind === 'job_seeker';
  const isOpening = kind === 'job_opening';
  const isJob = isSeeker || isOpening;

  const [s, setS] = useState<Sel>(EMPTY);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PublicListing[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false); // synchronous guard against concurrent loads
  const sentinel = useRef<HTMLDivElement>(null);
  const done = total != null && items.length >= total;

  // Debounce the in-category search.
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

  const loadMore = useCallback(async () => {
    // `loading` state isn't synchronous — two callers in one tick (mount effect
    // + the sentinel already in view) would both pass it and fetch page 1 twice.
    // The ref blocks that; the _id de-dupe below is the definitive safety net.
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const next = page + 1;
      const filters = isSaleBrowse
        ? { post_type: 'sell', sale_or_rent: kindSlug === 'rent' ? 'rent' : 'sale' }
        : isPtype ? { post_type: kindSlug } : toFilters(s);
      const r = await searchListings(q, city.name, kind, next, filters);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p._id));
        return [...prev, ...r.results.filter((x) => !seen.has(x._id))];
      });
      setTotal(r.total); setPage(next);
    } catch { /* ignore */ } finally { loadingRef.current = false; setLoading(false); }
  }, [done, page, kind, kindSlug, isPtype, s, q, city.slug]);

  // Reset on city / kind / filter / search change.
  useEffect(() => { setItems([]); setPage(0); setTotal(null); }, [city.slug, kind, kindSlug, s, q]);
  useEffect(() => { if (page === 0 && total === null) loadMore(); }, [page, total, loadMore]);

  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '300px' });
    io.observe(el); return () => io.disconnect();
  }, [loadMore]);

  const set = (k: keyof Sel, v: string) => setS((p) => ({ ...p, [k]: v }));

  // Share THIS section's link (unfurls to its branded OG card). Native share
  // sheet on mobile; WhatsApp fallback where the Web Share API isn't available.
  async function shareThis() {
    const url = `${location.origin}${location.pathname}`;
    const text = `${info.emoji} ${info.label} — ${city.name}\n👉 ${url}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${info.label} · ${city.name}`, text, url }); return; }
    } catch { return; }   // user dismissed the share sheet
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-4 rounded-b-3xl shadow-lg sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={back} aria-label="Back" className="text-white/80 text-lg">←</button>
              <div className="min-w-0">
                <div className="text-[11px] text-white/70">{city.name}</div>
                <div className="text-lg font-semibold truncate">{info.emoji} {info.label}{total != null && <span className="text-white/60 text-sm font-normal"> · {total}</span>}</div>
              </div>
            </div>
            <button type="button" onClick={shareThis} aria-label={t('common.share')} title={t('common.share')}
              className="shrink-0 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 4v4c-6.575 1.028 -9.02 6.788 -10 12c-.037 .206 5.384 -5.962 10 -6v4l8 -7l-8 -7z" />
              </svg>
            </button>
          </div>

          {/* In-category search (same engine as global, scoped to this kind) */}
          <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }} className="mt-3">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
              <SearchIcon />
              <input value={qInput} onChange={(e) => setQInput(e.target.value)}
                placeholder={`Search in ${info.label}`}
                className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400" />
              {qInput && <button type="button" onClick={() => { setQInput(''); setQ(''); }} className="text-slate-300">✕</button>}
            </div>
          </form>

          {isJob && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-1 px-1">
              <select className={sel} value={s.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">{t('filter.anyGender')}</option>
                <option value="male">{t('opt.male')}</option><option value="female">{t('opt.female')}</option><option value="other">{t('opt.other')}</option>
              </select>
              {isSeeker && (
                <select className={sel} value={s.age} onChange={(e) => set('age', e.target.value)}>
                  <option value="">{t('filter.anyAge')}</option>
                  <option value="18-25">18–25</option><option value="26-35">26–35</option>
                  <option value="36-45">36–45</option><option value="45">45+</option>
                </select>
              )}
              <select className={sel} value={s.exp} onChange={(e) => set('exp', e.target.value)}>
                <option value="">{isOpening ? t('filter.anyExpReq') : t('filter.anyExp')}</option>
                <option value="fresher">{t('filter.fresher')}</option>
                <option value="12">{t('filter.yrPlus', { n: 1 })}</option><option value="36">{t('filter.yrPlus', { n: 3 })}</option><option value="60">{t('filter.yrPlus', { n: 5 })}</option>
              </select>
              {isOpening && (
                <select className={sel} value={s.sal} onChange={(e) => set('sal', e.target.value)}>
                  <option value="">{t('filter.anySalary')}</option>
                  <option value="10000">₹10k+</option><option value="15000">₹15k+</option>
                  <option value="20000">₹20k+</option><option value="30000">₹30k+</option>
                </select>
              )}
              {(s.gender || s.age || s.exp || s.sal) &&
                <button onClick={() => setS(EMPTY)} className="shrink-0 text-xs text-white/80 underline px-2">{t('common.clear')}</button>}
            </div>
          )}
        </header>

        <main className="flex-1 px-4 py-4 pb-24 space-y-2.5">
          {items.map((l) => <ListingCard key={l._id} listing={l} />)}
          {!loading && items.length === 0 && total === 0 && (
            <div className="text-center text-sm text-slate-400 py-12">No matches{isJob ? ' for these filters' : ''}.</div>
          )}
          <div ref={sentinel} />
          {loading && <div className="text-center text-sm text-slate-400 py-3">Loading…</div>}
          {done && items.length > 0 && <div className="text-center text-[11px] text-slate-300 py-3">— end —</div>}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
