import { useEffect, useState } from 'react';
import type { PublicListing } from '@whatslocal/types';
import { getAffinity, getTrending, getOffers, searchListings } from '../lib/listings';
import { getVisitorId } from '../lib/analytics';
import { currentSession } from '../lib/userAuth';
import { topRecentCategories, getRecentViews } from '../lib/recentView';
import { useT } from '../lib/i18n';
import { ListingTile } from './ListingCard';

// A personalized stack of listing rails shown on the home BELOW the category
// tiles. Everyone gets a full page; WHICH rails and in what order is what
// changes per person. A listing shown in one rail is never repeated in another.
interface Rail { key: string; emoji: string; title: string; items: PublicListing[] }

// Vertical → how to fetch fresh listings for it, and its tile label/emoji. Keys
// match the affinity keys the server returns + verticalOf().
const VERT: Record<string, { kind?: string; filters?: Record<string, any>; labelKey: string; emoji: string }> = {
  business:  { kind: 'business',      labelKey: 'tiles.business',  emoji: '🏪' },
  jobs:      { kind: 'job_opening',   labelKey: 'tiles.jobs',      emoji: '💼' },
  sell:      { filters: { post_type: 'sell' },                         labelKey: 'tiles.bsr', emoji: '🛒' },
  rent:      { filters: { post_type: 'sell', sale_or_rent: 'rent' },   labelKey: 'tiles.bsr', emoji: '🏠' },
  happening: { kind: 'happening',     labelKey: 'tiles.happening', emoji: '🎉' },
};

export function HomeFeed({ cityName }: { citySlug: string; cityName: string }) {
  const { t } = useT();
  const [rails, setRails] = useState<Rail[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Signals: server affinity (vertical-level) + the last 2-3 categories
      //    this device actually browsed (recency+frequency weighted).
      const affinity = await getAffinity(getVisitorId(), currentSession()?.id).catch(() => ({} as Record<string, number>));
      const recentCats = topRecentCategories(cityName, 3);

      // Fetch for a recent interest: the exact CATEGORY first (precise), then the
      // whole VERTICAL as fill — so a sparse category (e.g. a job role with a
      // single listing you've already seen) still contributes to the blend
      // instead of silently dropping out.
      const interestFetch = (c: { vertical: string; category: string; kind: string }): Promise<PublicListing[]> => {
        const kind = c.vertical === 'jobs' ? (c.kind || 'job_opening')
          : c.vertical === 'happening' ? 'happening'
          : (c.vertical === 'sell' || c.vertical === 'rent') ? undefined : 'business';
        const isSell = c.vertical === 'sell' || c.vertical === 'rent';
        const sellF = (extra: Record<string, any>) => ({ post_type: 'sell', ...(c.vertical === 'rent' ? { sale_or_rent: 'rent' } : {}), ...extra });
        const narrowF = isSell ? sellF({ category: c.category }) : { category: c.category };
        const broadF = isSell ? sellF({}) : undefined;
        return Promise.all([
          c.category ? searchListings('', cityName, kind, 1, narrowF).then((r) => r.results as PublicListing[]).catch(() => []) : Promise.resolve([] as PublicListing[]),
          searchListings('', cityName, kind, 1, broadF).then((r) => r.results as PublicListing[]).catch(() => []),
        ]).then(([cat, vert]) => {
          const seen = new Set<string>(); const out: PublicListing[] = [];
          for (const l of [...cat, ...vert]) if (l && !seen.has(l._id)) { seen.add(l._id); out.push(l); }
          return out;
        });
      };

      // 2) Fetch the recent-interest pools + the fixed rails in parallel.
      // ("Fresh in {city}" is hidden for now — the New tile already covers it.)
      const [perCat, offers, trend] = await Promise.all([
        Promise.all(recentCats.map(interestFetch)),
        getOffers(cityName).then((r) => r.results).catch(() => [] as PublicListing[]),
        getTrending(cityName).then((r) => r.results).catch(() => [] as PublicListing[]),
      ]);
      if (!alive) return;

      // 3) BLENDED "more like what you saw": round-robin across the recent
      //    categories, excluding listings already viewed, deduped, capped.
      const alreadySeen = new Set(getRecentViews().map((v) => v.id));
      let persItems: PublicListing[] = [];
      const cursors = perCat.map(() => 0);
      let progress = true;
      while (progress && persItems.length < 9) {
        progress = false;
        for (let i = 0; i < perCat.length; i++) {
          const arr = perCat[i];
          while (cursors[i] < arr.length && alreadySeen.has(arr[cursors[i]]._id)) cursors[i]++;
          if (cursors[i] < arr.length) {
            const it = arr[cursors[i]++];
            alreadySeen.add(it._id); persItems.push(it); progress = true;
            if (persItems.length >= 9) break;
          }
        }
      }
      let persTitle = t('feed.moreLike');
      let persEmoji = VERT[recentCats[0]?.vertical || '']?.emoji || '✨';

      // Cold-start fallback (no browse history yet): affinity top vertical, else
      // a time-of-day default (mornings lean jobs).
      if (!persItems.length) {
        const top = Object.entries(affinity).sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => VERT[k]);
        const hr = new Date().getHours();
        const persVert = top || (hr >= 6 && hr < 12 ? 'jobs' : 'business');
        persItems = await searchListings('', cityName, VERT[persVert]?.kind, 1, VERT[persVert]?.filters).then((r) => r.results as PublicListing[]).catch(() => []);
        if (!alive) return;
        persTitle = t('feed.because', { label: VERT[persVert] ? t(VERT[persVert].labelKey) : '' });
        persEmoji = VERT[persVert]?.emoji || '✨';
      }

      // 4) Assemble rails, deduping across them so nothing repeats.
      const seen = new Set<string>();
      const dedupe = (arr: PublicListing[], min: number, cap = 10) => {
        const out = arr.filter((l) => l && !seen.has(l._id)).slice(0, cap);
        if (out.length < min) return [];
        out.forEach((l) => seen.add(l._id));
        return out;
      };
      const built: Rail[] = [];
      const push = (key: string, emoji: string, title: string, items: PublicListing[]) => {
        if (items.length) built.push({ key, emoji, title, items });
      };
      push('pers', persEmoji, persTitle, dedupe(persItems, 1));
      push('offers', '🏷️', t('feed.offers', { city: cityName }), dedupe(offers, 2));
      push('trending', '🔥', t('feed.trending'), dedupe(trend, 2));

      setRails(built);
    })();
    return () => { alive = false; };
  }, [cityName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rails || rails.length === 0) return null;

  return (
    <div className="space-y-6">
      {rails.map((r) => (
        <section key={r.key}>
          <div className="flex items-center gap-2 mb-2.5 px-0.5">
            <span className="text-lg">{r.emoji}</span>
            <span className="text-base font-bold text-slate-900 truncate">{r.title}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {r.items.map((l) => <ListingTile key={l._id} listing={l} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
