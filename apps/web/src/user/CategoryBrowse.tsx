import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { resolveCity } from '../lib/city';
import { useT } from '../lib/i18n';
import { useSmartBack } from '../lib/useSmartBack';
import { searchListings, getCategoryBreakdown } from '../lib/listings';
import { catLabel, categoryEmoji, catSlug } from '../lib/listingMeta';
import { ListingTile } from './ListingCard';
import { BottomNav } from './BottomNav';
import { useScrollMemory } from '../lib/ScrollMemory';

// A sub-category = a quick filter within a bucket. `slug` is its URL-safe id (so
// each category has a shareable page, /browse/sell/furniture). `cats` scopes to
// exact catalog categories; `q` refines by blob text; `kind` overrides the bucket
// kind (Jobs → openings/seekers).
interface Sub { key: string; label: string; icon: string; slug?: string; cats?: string[]; q?: string; kind?: string }
// A "deal" = a top-level segment (Sale / Rent) with its own filter. Its rail is
// data-driven (real categories for that deal), so no static `subs`.
interface Deal { key: string; labelKey: string; filter: Record<string, string> }
// The rail is DATA-DRIVEN from the real categories assigned at posting:
// `dynamicKind` (business) or `dynamicPostType` (+ deals for Sale/Rent). `subs`
// is only for the fixed kind-axis buckets (Jobs, Happenings).
interface BucketCfg { titleKey: string; cat: string; kind?: string; post_type?: string; dynamicKind?: string; dynamicPostType?: string; excludeSell?: boolean; subs?: Sub[]; deals?: Deal[] }

const BUCKETS: Record<string, BucketCfg> = {
  // Business rail is DATA-DRIVEN: the real categories that actually have listings
  // (Marketing/PR, Veterinary, NGO…), no "All", opens the first category.
  business: { titleKey: 'tiles.business', cat: 'business', kind: 'business', dynamicKind: 'business', excludeSell: true },
  // Buy, sell & rent — Sale/Rent is the top split; the rail below is DATA-DRIVEN
  // (the real categories assigned at posting, for that deal), same as Business.
  sell: {
    titleKey: 'tiles.bsr', cat: 'sell', post_type: 'sell', dynamicPostType: 'sell',
    deals: [
      { key: 'sale', labelKey: 'deal.sale', filter: { sale_or_rent: 'sale' } },
      { key: 'rent', labelKey: 'deal.rent', filter: { sale_or_rent: 'rent' } },
    ],
  },
  jobs: {
    titleKey: 'tiles.jobs', cat: 'jobs',
    subs: [
      { key: 'openings', label: 'Openings', icon: '📢', kind: 'job_opening' },
      { key: 'seekers', label: 'Candidates', icon: '🙋', kind: 'job_seeker' },
    ],
  },
  happening: {
    titleKey: 'tiles.happening', cat: 'happening', kind: 'happening',
    subs: [
      { key: 'event', label: 'Events', icon: '🎊', q: 'event' },
      { key: 'news', label: 'News', icon: '📰', q: 'news' },
    ],
  },
};

export function CategoryBrowse() {
  const { city: citySlug, bucket = '', sub: routeSub } = useParams();
  const city = resolveCity(citySlug);
  const { t, lang } = useT();
  const nav = useNavigate();
  const back = useSmartBack(`/${city.slug}`);
  const cfg = BUCKETS[bucket];
  const deals = cfg?.deals;
  const dynamic = cfg?.dynamicKind || cfg?.dynamicPostType;   // data-driven rail?
  // Short rail label from a category: first segment before "/" or "—", minus a
  // "(Used)" suffix — e.g. "Property — House / Flat / Plot / Shop" → "Property".
  const railLabel = (key: string) => catLabel(key, lang).split('/')[0].split('—')[0].replace(/\(used\)/i, '').trim();
  // Deal (Sale/Rent) lives in ?deal (defaults to the first); the CATEGORY lives
  // in the URL PATH (/browse/:bucket/:sub) so every category is a shareable link.
  const [sp] = useSearchParams();
  const dealKey = (deals?.some((d) => d.key === sp.get('deal')) ? sp.get('deal') : deals?.[0]?.key) || '';
  const [subKey, setSubKey] = useState('');       // resolved from routeSub + avail
  const [byKey, setByKey] = useState<Record<string, PublicListing[]> | null>(null);
  const [avail, setAvail] = useState<Sub[]>([]);
  const [q, setQ] = useState('');                 // global search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRes, setSearchRes] = useState<PublicListing[] | null>(null);
  // Set when the typed spelling found nothing but a correction did.
  const [corrected, setCorrected] = useState('');

  // Build the rail. DYNAMIC bucket → the real categories present in the data
  // (busiest first). STATIC bucket → pre-fetch each sub, keep only non-empty.
  useEffect(() => {
    if (!cfg) return;
    setByKey(null);
    let alive = true;
    if (dynamic) {
      const dealFilter = deals?.find((d) => d.key === dealKey)?.filter || {};
      getCategoryBreakdown(city.name, cfg.dynamicKind, cfg.dynamicPostType, dealFilter.sale_or_rent, cfg.excludeSell).then(({ results }) => {
        if (!alive) return;
        const subs: Sub[] = results.map((r) => ({ key: r.key, label: railLabel(r.key), icon: categoryEmoji(r.key), slug: catSlug(r.key) }));
        setAvail(subs);
        setByKey({});   // categories load lazily on select
      }).catch(() => { if (alive) { setAvail([]); setByKey({}); } });
    } else {
      const curSubs = cfg.subs || [];   // static buckets (Jobs, Happenings) — no deals
      Promise.all(curSubs.map(async (s) => {
        const filters = {
          ...(cfg.post_type ? { post_type: cfg.post_type } : {}),
          ...(s.cats?.length ? { category: s.cats.join(',') } : {}),
        };
        const r = await searchListings(s.q || '', city.name, s.kind || cfg.kind, 1, Object.keys(filters).length ? filters : undefined)
          .catch(() => ({ results: [], total: 0 } as any));
        return { key: s.key, results: r.results as PublicListing[], total: r.total as number };
      })).then((res) => {
        if (!alive) return;
        const map: Record<string, PublicListing[]> = {};
        res.forEach((x) => { map[x.key] = x.results; });
        setByKey(map);
        setAvail(curSubs.filter((s) => (res.find((x) => x.key === s.key)?.total || 0) > 0));
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [bucket, city.name, dealKey]);

  // Resolve the URL's category slug → the selected category (falls back to the
  // first). Re-runs when the path changes (Back) or the rail (deal switch) does.
  useEffect(() => {
    if (!avail.length) return;
    const match = avail.find((s) => (s.slug || s.key) === routeSub);
    setSubKey(match ? match.key : (avail[0]?.key || ''));
  }, [routeSub, avail]);

  // Dynamic bucket: lazily fetch the selected category's listings (cached),
  // scoped to the bucket kind/post_type + the current deal (Sale/Rent).
  useEffect(() => {
    if (!dynamic || !subKey || !byKey || byKey[subKey]) return;
    let alive = true;
    const dealFilter = deals?.find((d) => d.key === dealKey)?.filter || {};
    const filters = { category: subKey, ...(cfg?.dynamicPostType ? { post_type: cfg.dynamicPostType } : {}), ...dealFilter };
    searchListings('', city.name, cfg?.dynamicKind, 1, filters)
      .then((r) => { if (alive) setByKey((prev) => ({ ...(prev || {}), [subKey]: r.results as PublicListing[] })); })
      .catch(() => { if (alive) setByKey((prev) => ({ ...(prev || {}), [subKey]: [] })); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [dynamic, subKey, dealKey, city.name, byKey]);

  // Search is GLOBAL, not scoped to this bucket. Debounced.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setSearchRes(null); setCorrected(''); return; }
    const tm = setTimeout(() => {
      searchListings(term, city.name)
        .then((r) => { setSearchRes(r.results as PublicListing[]); setCorrected(r.corrected || ''); })
        .catch(() => { setSearchRes([]); setCorrected(''); });
    }, 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line
  }, [q, city.name]);

  if (!cfg) return <Navigate to={`/${city.slug}`} replace />;
  const searching = !!q.trim();
  const items = searching ? searchRes : (byKey ? (byKey[subKey] ?? null) : null);

  // The results grid is its own scroller, so the page-level ScrollMemory can't
  // see it — without this, Back from a post always dumped you at the top of the
  // list instead of where you were. Restore only once the items exist, or the
  // container is still empty and scrollTop clamps to 0.
  const gridRef = useRef<HTMLDivElement>(null);
  useScrollMemory(gridRef, `grid:${bucket}:${subKey}`, !!items?.length);

  // Selection = navigation (replace, so Back from a listing returns to the SAME
  // category and every category is a shareable URL). Deal in ?deal (only when not
  // the default), category in the path.
  const dealQ = (d: string) => (deals && d !== deals[0].key ? `?deal=${d}` : '');
  const selectSub = (s: Sub) => nav(`/${city.slug}/browse/${bucket}/${s.slug || s.key}${dealQ(dealKey)}`, { replace: true });
  const selectDeal = (d: string) => nav(`/${city.slug}/browse/${bucket}${dealQ(d)}`, { replace: true });

  // Share the CURRENTLY selected category as its own link (WhatsApp / native).
  async function doShare() {
    const s = avail.find((x) => x.key === subKey);
    const slug = s ? (s.slug || s.key) : '';
    const url = `${location.origin}/${city.slug}/browse/${bucket}${slug ? '/' + slug : ''}${dealQ(dealKey)}`;
    const name = s ? s.label : t(cfg.titleKey);
    const text = `${name} in ${city.name} — WhatsLocal`;
    try { if (navigator.share) { await navigator.share({ title: name, text, url }); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank', 'noopener');
  }

  return (
    <div className="h-[100dvh] bg-slate-200/70 flex justify-center">
      {/* Fixed viewport height + overflow-hidden so the rail and grid each get
          their OWN scroll instead of scrolling the whole page together. */}
      <div className="w-full max-w-[480px] h-[100dvh] bg-slate-50 shadow-xl flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3 shrink-0">
          <button onClick={back} aria-label={t('common.back')} className="text-slate-800 text-xl leading-none px-1">←</button>
          {searchOpen ? (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t('home.searchPh')}
                className="flex-1 min-w-0 bg-slate-100 rounded-full px-4 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand/30" />
              <button onClick={() => { setSearchOpen(false); setQ(''); }} aria-label={t('common.back')} className="text-slate-400 text-lg leading-none px-1">✕</button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 truncate leading-tight">{t(cfg.titleKey)}</div>
                <div className="text-[11px] text-brand">{city.name}</div>
              </div>
              <button onClick={doShare} aria-label="Share this category" className="text-slate-500 px-1">
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
                </svg>
              </button>
              <button onClick={() => setSearchOpen(true)} aria-label="Search" className="text-slate-500 text-lg px-1">🔍</button>
            </>
          )}
        </header>

        {/* Sale / Rent top toggle (Buy-sell-rent only) — rebuilds the rail below. */}
        {deals && !searching && (
          <div className="bg-white px-3 pt-2 pb-2 border-b border-slate-100 shrink-0">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {deals.map((d) => {
                const on = d.key === dealKey;
                return (
                  <button key={d.key} onClick={() => selectDeal(d.key)}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition ${on ? 'bg-white text-brand shadow-sm' : 'text-slate-500'}`}>
                    {t(d.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          {/* left category rail — real categories, non-empty only */}
          <div className="w-[74px] shrink-0 bg-slate-100 overflow-y-auto no-scrollbar pb-24">
            {avail.map((s) => {
              const on = s.key === subKey;
              return (
                <button key={s.key} onClick={() => selectSub(s)} className="relative w-full py-2.5 px-1 text-center">
                  {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
                  <span className={`mx-auto mb-1 h-10 w-10 rounded-full flex items-center justify-center text-xl ${on ? 'bg-brand/10' : 'bg-white border border-slate-200'}`}>{s.icon}</span>
                  <span className={`block text-[9.5px] leading-tight line-clamp-2 ${on ? 'text-brand font-medium' : 'text-slate-500'}`}>{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* right grid */}
          <div ref={gridRef} className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
            {/* Sent here from a shop's "Calling for a job?" prompt. */}
            {sp.get('note') === 'hiring' && !searching && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                <span className="text-base leading-none">ℹ️</span>
                <span className="text-[13px] font-medium text-emerald-800">{t('jobs.onlyHiring', { city: city.name })}</span>
              </div>
            )}
            {/* We silently searched for something else — say so, and let them
                insist on what they typed. */}
            {searching && corrected && (
              <div className="mb-2.5 text-[13px] text-slate-500">
                {t('search.showingFor')} <span className="font-semibold text-slate-800">{corrected}</span>
              </div>
            )}
            {byKey !== null && avail.length === 0 ? (
              // Rail loaded but nothing here (or the breakdown failed) — never hang on "Loading".
              <div className="text-center py-14 px-4">
                <div className="text-3xl mb-2">🔍</div>
                <div className="text-slate-400 text-sm">{t('home.empty')}</div>
              </div>
            ) : items === null ? (
              <div className="text-center text-slate-400 text-sm py-10">{t('common.loading')}</div>
            ) : items.length === 0 ? (
              <div className="text-center py-14 px-4">
                <div className="text-3xl mb-2">🔍</div>
                <div className="text-slate-400 text-sm">{t('home.empty')}</div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {items.map((l) => <ListingTile key={l._id} full showCategory listing={l} />)}
              </div>
            )}
          </div>
        </div>

        <BottomNav />
      </div>
    </div>
  );
}
