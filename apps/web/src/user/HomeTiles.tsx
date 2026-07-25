import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';

// Home = six fixed category buckets (New + Offers on top). Big-scope buckets
// have a rotating subtitle that cycles example ranges every few seconds. No
// listings on the home for now — categories only.
interface Bucket {
  key: string;
  emoji: string;
  ring: string;                 // tailwind bg/text for the icon circle
  titleKey: string;
  href: (citySlug: string) => string;
  subStatic?: string;           // one fixed subtitle key
  subKeys?: string[];           // rotating subtitle keys
}

// New + Offers are FIND feeds; the four category buckets open the two-pane
// browse page (left sub-category rail + right grid) for that bucket.
const BUCKETS: Bucket[] = [
  // Cab sharing takes the old "New in {city}" slot — "new" was subjective and
  // hard to identify, whereas a one-way cab is concrete and time-critical.
  { key: 'cabs', emoji: '🚕', ring: 'bg-amber-100 text-amber-700', titleKey: 'cab.title', href: (s) => `/${s}/cabs`, subStatic: 'cab.sub' },
  { key: 'offers', emoji: '🏷️', ring: 'bg-rose-100 text-rose-600', titleKey: 'tiles.offers', href: (s) => `/${s}/offers`, subKeys: ['tiles.offers.s1', 'tiles.offers.s2', 'tiles.offers.s3'] },
  { key: 'bsr', emoji: '🛒', ring: 'bg-emerald-100 text-emerald-700', titleKey: 'tiles.bsr', href: (s) => `/${s}/browse/sell`, subKeys: ['tiles.bsr.s1', 'tiles.bsr.s2', 'tiles.bsr.s3', 'tiles.bsr.s4'] },
  { key: 'jobs', emoji: '💼', ring: 'bg-sky-100 text-sky-700', titleKey: 'tiles.jobs', href: (s) => `/${s}/browse/jobs`, subStatic: 'tiles.jobs.sub' },
  { key: 'business', emoji: '🏪', ring: 'bg-violet-100 text-violet-700', titleKey: 'tiles.business', href: (s) => `/${s}/browse/business`, subKeys: ['tiles.business.s1', 'tiles.business.s2', 'tiles.business.s3'] },
  { key: 'happening', emoji: '🎉', ring: 'bg-amber-100 text-amber-700', titleKey: 'tiles.happening', href: (s) => `/${s}/browse/happening`, subStatic: 'tiles.happening.sub' },
];

export function HomeTiles({ citySlug }: { citySlug: string; cityName?: string }) {
  const { t } = useT();
  const [tick, setTick] = useState(0);
  const [show, setShow] = useState(true);   // soft fade-out → swap → fade-in, like the header
  useEffect(() => {
    const iv = setInterval(() => {
      setShow(false);
      setTimeout(() => { setTick((n) => n + 1); setShow(true); }, 220);
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  const subFor = (b: Bucket) => b.subKeys ? t(b.subKeys[tick % b.subKeys.length]) : (b.subStatic ? t(b.subStatic) : '');

  return (
    <div className="grid grid-cols-3 gap-2">
      {BUCKETS.map((b) => (
        <Link key={b.key} to={b.href(citySlug)}
          className="min-h-[104px] flex flex-col items-center justify-center text-center rounded-2xl bg-white border border-slate-200 shadow-card py-3 px-1 active:scale-[.97]">
          <span className={`h-10 w-10 rounded-full flex items-center justify-center text-xl mb-1.5 ${b.ring}`}>{b.emoji}</span>
          <span className="text-[12px] font-semibold text-slate-800 leading-tight max-w-full line-clamp-2">{t(b.titleKey)}</span>
          <span className="text-[10px] text-slate-400 max-w-full truncate mt-0.5 transition-opacity duration-200"
            style={{ opacity: b.subKeys && !show ? 0 : 1 }}>{subFor(b)}</span>
        </Link>
      ))}
    </div>
  );
}
