import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { BRAND } from '../lib/brand';
import { setAnalyticsContext, trackSearch } from '../lib/analytics';
import { maybeAskPush } from '../lib/push';
import { searchListings, visitorsToday, postingsCount, homeSections, pinLookup, type HomeSection } from '../lib/listings';
import { resolveCity, setLastCity, cityNameToSlug, KIND_TO_SLUG } from '../lib/city';
import { useT, getStoredLang } from '../lib/i18n';
import { ListingTile } from './ListingCard';
import { WardComplaintsSection } from './complaints/WardComplaintsSection';
import { HomeTiles } from './HomeTiles';
import { HomeFeed } from './HomeFeed';
import { catLabel } from '../lib/listingMeta';
import { BottomNav } from './BottomNav';
import { LangToggle } from './LangToggle';

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">{children}</div>
    </div>
  );
}
// Rotating two-sided tagline (find AND post), vertical-flip, cycles ~3s in the
// user's current language.
const FLIP_KEYS = ['flip.1', 'flip.2', 'flip.3', 'flip.4', 'flip.5', 'flip.6'];
function FlipTagline() {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);   // soft fade-out → swap → fade-in
  useEffect(() => {
    const iv = setInterval(() => {
      setShow(false);
      setTimeout(() => { setI((n) => (n + 1) % FLIP_KEYS.length); setShow(true); }, 220);
    }, 3200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="mt-1.5 text-[12px] text-white/85 truncate transition-opacity duration-200" style={{ opacity: show ? 1 : 0 }}>
      {t(FLIP_KEYS[i])}
    </div>
  );
}
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-slate-400">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// City switcher popup — asks for a 6-digit pincode, resolves it to a city via
// pinLookup, remembers it, and navigates to that city's home. Rendered as a
// dimmed-backdrop modal (same pattern as OtpLogin's popup mode).
function CitySwitcher({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Open the number pad as soon as the popup appears so the user can just type
  // (autoFocus alone often doesn't raise the keyboard on mobile).
  const pinRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const tm = setTimeout(() => pinRef.current?.focus(), 80); return () => clearTimeout(tm); }, []);

  async function go(value?: string) {
    const p = String(value ?? pin).replace(/\D/g, '');
    setErr('');
    if (!/^\d{6}$/.test(p)) { setErr(t('city.switch.notFound')); return; }
    setBusy(true);
    try {
      const r = await pinLookup(p);
      const slug = cityNameToSlug(r.city);
      setLastCity({ slug, name: r.city, pincode: p });   // remember + set as last city
      onClose();
      nav(`/${slug}`);
    } catch {
      setErr(t('city.switch.notFound'));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="relative w-full max-w-[360px] rounded-2xl bg-white px-6 py-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center text-lg">✕</button>
        <div className="text-center mb-5">
          <div className="text-lg font-semibold text-slate-800">{t('city.switch.title')}</div>
          <div className="text-sm text-slate-500 mt-1">{t('city.switch.subtitle')}</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input ref={pinRef} value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setPin(v); setErr('');
              if (v.length === 6 && !busy) go(v);   // 6 digits → go, no extra tap
            }}
            type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus placeholder={t('city.switch.ph')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand tracking-widest text-center" />
          {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mt-3">{err}</div>}
          <button type="submit" disabled={busy || pin.length < 6}
            className="mt-4 w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-50">
            {busy ? '…' : t('city.switch.go')}
          </button>
        </form>
      </div>
    </div>
  );
}

// `adminPreview` renders the exact same user home inside the admin User View —
// only difference is the bottom-nav actions that don't apply to an admin
// (My Posts / Post) are disabled. Everything else stays a true mirror.
// Cache the last-loaded sections per city so returning to Home (back button)
// paints instantly — content is present, so scroll position can be restored.
const HOME_CACHE = new Map<string, HomeSection[]>();

export function Home({ adminPreview = false, forcePinPrompt = false }: { adminPreview?: boolean; forcePinPrompt?: boolean }) {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicListing[] | null>(null);
  const [searchedTerm, setSearchedTerm] = useState('');
  const [corrected, setCorrected] = useState('');
  const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState<HomeSection[]>(() => HOME_CACHE.get(city.name) || []);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'ready'>(() => HOME_CACHE.get(city.name) ? 'ready' : 'loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [visitors, setVisitors] = useState<number | null>(null);
  const [postings, setPostings] = useState<number | null>(null);
  const [statTick, setStatTick] = useState(0);    // even = visitors, odd = postings
  const [statShow, setStatShow] = useState(true);  // soft fade on swap
  const [cityOpen, setCityOpen] = useState(forcePinPrompt);
  const [params, setParams] = useSearchParams();
  const { t, lang } = useT();

  useEffect(() => { setAnalyticsContext({ city: city.name, pincode: city.pincode }); }, [city]);

  // Browsing a specific city (/:city) makes it the "last city" → next bare-URL
  // visit lands straight here. Not for the admin User View mirror.
  useEffect(() => {
    if (!adminPreview && citySlug) setLastCity(city);
  }, [city.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // First-time prompt dismissed without picking → accept the default city and
  // remember it, so the visitor isn't re-prompted on every visit.
  const closeCityPrompt = () => {
    if (forcePinPrompt) setLastCity(city);
    setCityOpen(false);
  };
  useEffect(() => {
    const load = () => {
      visitorsToday(city.name).then((r) => setVisitors(r.count)).catch(() => {});
      postingsCount(city.name).then((r) => setPostings(r.count)).catch(() => {});
    };
    load();
    // This visit's page_view is sent via sendBeacon and may not have hit the DB
    // yet on first paint, so re-read once it's had time to land — this is what
    // makes the count tick up for the visitor's own fresh visit/tab.
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [city]);

  // Alternate the top-left badge between visitors and postings, soft fade.
  useEffect(() => {
    const iv = setInterval(() => {
      setStatShow(false);
      setTimeout(() => { setStatTick((n) => n + 1); setStatShow(true); }, 220);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  // Load the home sections. A failed request must NOT look like an empty city —
  // on error we keep showing a retry/loading state and auto-retry with backoff,
  // so a transient rate-limit/network blip never leaves the page blank.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const secs = await homeSections(city.name);
        if (cancelled) return;
        HOME_CACHE.set(city.name, secs);
        setSections(secs);
        setLoadStatus('ready');
      } catch {
        if (cancelled) return;
        setLoadStatus('error');
        if (attempt < 5) { attempt += 1; timer = setTimeout(load, 2000 * attempt); } // 2s,4s,6s…
      }
    }
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [city.slug, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const qp = params.get('q');
    if (qp) { setQ(qp); runSearch(qp); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Live search: filter as the user types, after a short pause (no Enter needed).
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults(null); return; }
    const t = setTimeout(() => runSearch(term), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function runSearch(query: string) {
    if (!query.trim()) { setResults(null); return; }
    setBusy(true); setSearchedTerm(query);
    try {
      const res = await searchListings(query, city.name);
      setResults(res.results);
      // Only set when the typed spelling drew a blank and a fix worked.
      setCorrected(res.corrected || '');
      trackSearch(query, res.total);
      if (res.total === 0) maybeAskPush('search');   // nothing found → offer an alert
    }
    catch { setResults([]); setCorrected(''); trackSearch(query, 0); }
    finally { setBusy(false); }
  }

  const anyGroup = sections.length > 0;
  const showSections = false; // listings on home come later — categories-only for now
  const seeAll = (s: HomeSection) =>
    s.type === 'cat' ? `/${city.slug}/cat/${s.key}`
      : s.type === 'sale' ? `/${city.slug}/${s.key === 'rent' ? 'rent' : 'sell'}`
      : s.type === 'ptype' ? `/${city.slug}/${s.key}`
      : `/${city.slug}/${KIND_TO_SLUG[s.key] || s.key}`;
  const sectionLabel = (s: HomeSection) =>
    s.type === 'kind' ? t(`kind.${s.key}`)
      : s.type === 'sale' ? t(`saleSec.${s.key}`)
      : s.type === 'ptype' ? t(`ptypeSec.${s.key}`)
      : catLabel(s.key, lang);

  return (
    <MobileFrame>
      <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-pulse shrink-0" />
            {/* Both texts stacked in ONE grid cell → the pill width is always the
                longer of the two and never changes on swap; only the text fades. */}
            <span className="grid text-xs font-medium whitespace-nowrap">
              <span className="col-start-1 row-start-1 transition-opacity duration-200" style={{ opacity: statTick % 2 === 0 && statShow ? 1 : 0 }}>
                {visitors == null ? '…' : t('home.visitors', { n: visitors.toLocaleString('en-IN') })}
              </span>
              <span className="col-start-1 row-start-1 transition-opacity duration-200" style={{ opacity: statTick % 2 === 1 && statShow ? 1 : 0 }}>
                {postings == null ? '…' : t('home.postings', { n: postings.toLocaleString('en-IN') })}
              </span>
            </span>
          </div>
          <button type="button" onClick={() => setCityOpen(true)} className="flex items-center gap-1 min-w-0 active:scale-95 transition">
            <span className="text-[11px] text-white/70">{BRAND.displayName} in</span>
            <span className="text-sm font-semibold truncate">{city.name}</span>
            <span className="text-white/70 text-xs">▾</span>
          </button>
          <LangToggle onDark />
        </div>
        <FlipTagline />
        <form onSubmit={(e) => { e.preventDefault(); runSearch(q); }} className="mt-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-card">
            <SearchIcon />
            <input value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.searchPh')}
              className="flex-1 bg-transparent outline-none text-[15px] text-slate-800 placeholder:text-slate-400" />
            {q && <button type="button" onClick={() => { setQ(''); setResults(null); setParams({}); }} className="text-slate-300">✕</button>}
          </div>
        </form>
      </header>

      <main className="flex-1 px-4 pb-24 pt-3">
        {results === null ? (
          <div className="space-y-6 mt-1">
            <HomeTiles citySlug={city.slug} cityName={city.name} />
            <HomeFeed citySlug={city.slug} cityName={city.name} />
            {showSections && (<>
            {!anyGroup && loadStatus === 'loading' && (
              <div className="text-sm text-slate-400 py-10 text-center">{t('common.loading')}</div>
            )}
            {!anyGroup && loadStatus === 'error' && (
              <div className="py-10 text-center">
                <div className="text-sm text-slate-400">{t('home.retry')}</div>
                <button type="button" onClick={() => { setLoadStatus('loading'); setReloadKey((k) => k + 1); }}
                  className="mt-2 text-sm font-medium text-brand">{t('home.tapRetry')}</button>
              </div>
            )}
            {!anyGroup && loadStatus === 'ready' && (
              <div className="text-sm text-slate-400 py-10 text-center">{t('home.empty')}</div>
            )}
            {sections.map((s) => s.type === 'special' && s.key === 'complaints' ? (
              <WardComplaintsSection key={s.id} citySlug={city.slug} cityName={city.name} />
            ) : (
              <section key={s.id}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{s.emoji}</span>
                    <span className="text-base font-bold text-slate-900 truncate">{sectionLabel(s)}</span>
                  </div>
                  <Link to={seeAll(s)} className="text-xs font-medium text-brand shrink-0">{t('home.seeAll')}</Link>
                </div>
                {/* Swipe left/right */}
                <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {s.items.slice(0, 10).map((l) => <ListingTile key={l._id} listing={l} />)}
                  {s.total > 10 && (
                    <Link to={seeAll(s)}
                      className="shrink-0 w-28 rounded-2xl bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 active:scale-[.98]">
                      <span className="text-2xl">→</span>
                      <span className="text-xs mt-1">{t('home.moreCount', { n: s.total - 10 })}</span>
                    </Link>
                  )}
                </div>
              </section>
            ))}
            </>)}
          </div>
        ) : (
          <section className="mt-3">
            {busy && <div className="text-center text-sm text-slate-400 py-4">{t('home.searching')}</div>}
            {!busy && results.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-10">{t('home.noResults', { q: searchedTerm })}</div>
            )}
            {/* The typed spelling found nothing — tell them what we searched. */}
            {!busy && corrected && results.length > 0 && (
              <div className="mb-2.5 text-[13px] text-slate-500">
                {t('search.showingFor')} <span className="font-semibold text-slate-800">{corrected}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {results.map((l) => <ListingTile key={l._id} full showCategory listing={l} />)}
            </div>
          </section>
        )}
      </main>

      <BottomNav preview={adminPreview} />
      {/* Hold the pincode prompt back until a language has been picked. Both
          prompts used to mount together, so the pincode input grabbed focus
          while the language gate was still covering it — by the time you chose
          a language the cursor (and the number pad) was gone. Mounting it only
          afterwards means its autofocus fires when it's actually on top. */}
      {cityOpen && getStoredLang() && <CitySwitcher onClose={closeCityPrompt} />}
    </MobileFrame>
  );
}
