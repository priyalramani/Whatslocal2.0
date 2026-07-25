import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { resolveCity } from '../lib/city';
import { useT } from '../lib/i18n';
import { useSmartBack } from '../lib/useSmartBack';
import { getOffers, getRecent, getAffinity } from '../lib/listings';
import { getVisitorId } from '../lib/analytics';
import { currentSession } from '../lib/userAuth';
import { getLastListing } from '../lib/recentView';
import { ListingTile } from './ListingCard';
import { BottomNav } from './BottomNav';

// The two fixed home feeds: "Offers in Gondia" (businesses with an active offer)
// and "New in Gondia" (newest listings across everything).
export function FeedPage({ mode }: { mode: 'offers' | 'new' }) {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const { t } = useT();
  const back = useSmartBack(`/${city.slug}`);
  const [items, setItems] = useState<PublicListing[] | null>(null);

  useEffect(() => {
    setItems(null);
    let alive = true;
    (async () => {
      if (mode === 'offers') {
        const r = await getOffers(city.name).catch(() => ({ results: [] }));
        if (alive) setItems(r.results);
        return;
      }
      // New in town: float the visitor's top interest (seed listing, else affinity).
      const aff = await getAffinity(getVisitorId(), currentSession()?.id).catch(() => ({} as Record<string, number>));
      const seed = getLastListing();
      const top = seed?.vertical || Object.entries(aff).sort((a, b) => b[1] - a[1]).map(([k]) => k)[0];
      const r = await getRecent(city.name, top).catch(() => ({ results: [] }));
      if (alive) setItems(r.results);
    })();
    return () => { alive = false; };
  }, [city.name, mode]);

  const title = mode === 'offers' ? t('tiles.offers') : t('tiles.new');
  const emoji = mode === 'offers' ? '🏷️' : '🆕';

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-5 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={back} aria-label={t('common.back')} className="text-white/80 text-lg">←</button>
            <div className="font-semibold text-lg">{emoji} {title}</div>
          </div>
        </header>
        <main className="flex-1 px-4 py-4 pb-24">
          {items === null && <div className="text-slate-400 text-sm text-center py-10">{t('common.loading')}</div>}
          {items && items.length === 0 && <div className="text-slate-400 text-sm text-center py-12">{t('home.empty')}</div>}
          <div className="grid grid-cols-3 gap-2">
            {(items || []).map((l) => <ListingTile key={l._id} full showCategory listing={l} />)}
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
