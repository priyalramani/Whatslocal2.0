import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { CATEGORY_BY_KEY } from '@whatslocal/types';
import { searchListings } from '../lib/listings';
import { resolveCity } from '../lib/city';
import { useSmartBack } from '../lib/useSmartBack';
import { useT } from '../lib/i18n';
import { ListingCard } from './ListingCard';
import { BottomNav } from './BottomNav';

// Browse one business category (e.g. all pharmacies) — dense ROW list with
// infinite scroll + an in-category search box. Reached from a home category
// section's "See all".
export function CategoryListing() {
  const { city: citySlug, catKey = '' } = useParams();
  const city = resolveCity(citySlug);
  const cat = CATEGORY_BY_KEY[catKey];
  const { t } = useT();
  const back = useSmartBack(`/${city.slug}`);

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PublicListing[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = total != null && items.length >= total;

  useEffect(() => { const tm = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(tm); }, [qInput]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done || !cat) return;
    loadingRef.current = true; setLoading(true);
    try {
      const next = page + 1;
      const r = await searchListings(q, city.name, undefined, next, { category: cat.label });
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p._id));
        return [...prev, ...r.results.filter((x) => !seen.has(x._id))];
      });
      setTotal(r.total); setPage(next);
    } catch { /* ignore */ } finally { loadingRef.current = false; setLoading(false); }
  }, [done, page, q, city.slug, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setItems([]); setPage(0); setTotal(null); }, [city.slug, q, catKey]);
  useEffect(() => { if (page === 0 && total === null) loadMore(); }, [page, total, loadMore]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '300px' });
    io.observe(el); return () => io.disconnect();
  }, [loadMore]);

  if (!cat) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
      Category not found. <Link to={`/${city.slug}`} className="text-brand ml-2">← Home</Link>
    </div>
  );

  // Share this category's link (unfurls to its branded OG card). Native share
  // sheet on mobile; WhatsApp fallback where the Web Share API isn't available.
  async function shareThis() {
    const url = `${location.origin}${location.pathname}`;
    const text = `${cat.emoji} ${cat.label} — ${city.name}\n👉 ${url}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${cat.label} · ${city.name}`, text, url }); return; }
    } catch { return; }
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
                <div className="text-lg font-semibold flex items-center gap-2 truncate">
                  <span>{cat.emoji}</span>{cat.label}{total != null && <span className="text-white/60 text-sm font-normal"> · {total}</span>}
                </div>
              </div>
            </div>
            <button type="button" onClick={shareThis} aria-label={t('common.share')} title={t('common.share')}
              className="shrink-0 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 4v4c-6.575 1.028 -9.02 6.788 -10 12c-.037 .206 5.384 -5.962 10 -6v4l8 -7l-8 -7z" />
              </svg>
            </button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }} className="mt-3">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
              <span className="text-slate-400">🔍</span>
              <input value={qInput} onChange={(e) => setQInput(e.target.value)}
                placeholder={t('cats.searchIn', { label: cat.label })}
                className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400" />
              {qInput && <button type="button" onClick={() => { setQInput(''); setQ(''); }} className="text-slate-300">✕</button>}
            </div>
          </form>
        </header>

        <main className="flex-1 px-4 py-4 pb-24 space-y-2.5">
          {items.map((l) => <ListingCard key={l._id} listing={l} />)}
          {!loading && items.length === 0 && total === 0 && (
            <div className="text-center text-sm text-slate-400 py-12">{t('home.empty')}</div>
          )}
          <div ref={sentinel} />
          {loading && <div className="text-center text-sm text-slate-400 py-3">{t('common.loading')}</div>}
          {done && items.length > 0 && <div className="text-center text-[11px] text-slate-300 py-3">— end —</div>}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
