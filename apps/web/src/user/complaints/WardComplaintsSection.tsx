import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { getWards, type WardRow } from '../../lib/complaints';

// Home "Ward Complaints" section — rendered exactly like a category row (emoji +
// title + See all + a horizontal scroll of tiles). Tiles are the wards.
export function WardComplaintsSection({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const { t } = useT();
  const [wards, setWards] = useState<WardRow[] | null>(null);
  useEffect(() => { getWards(cityName).then(setWards).catch(() => setWards([])); }, [cityName]);
  if (wards === null) return null;   // while loading, don't flash

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🏛️</span>
          <span className="text-base font-bold text-slate-900 truncate">{t('cmp.title')}</span>
        </div>
        <Link to={`/${citySlug}/complaints`} className="text-xs font-medium text-brand shrink-0">{t('home.seeAll')}</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {wards.slice(0, 10).map((w) => (
          <Link key={w.number} to={`/${citySlug}/complaints/ward/${w.number}`}
            className="shrink-0 w-40 rounded-2xl bg-white border border-slate-200 p-3 active:scale-[.98]">
            <div className="text-2xl">🏛️</div>
            <div className="font-semibold text-slate-800 text-sm mt-1 truncate">{t('cmp.ward')} {w.number}</div>
            <div className="text-[11px] text-slate-500 truncate">{w.name || w.address || ' '}</div>
            <div className="text-[11px] mt-1">
              {w.open > 0
                ? <span className="text-amber-600">{w.open} {t('cmp.open').toLowerCase()}</span>
                : <span className="text-slate-400">{t('cmp.report')}</span>}
            </div>
          </Link>
        ))}
        {wards.length === 0 && (
          <Link to={`/${citySlug}/complaints`}
            className="shrink-0 w-40 rounded-2xl bg-white border border-dashed border-slate-300 p-3 flex flex-col items-center justify-center text-slate-500 active:scale-[.98]">
            <span className="text-2xl">＋</span>
            <span className="text-xs mt-1 text-center">{t('cmp.report')}</span>
          </Link>
        )}
        {wards.length > 10 && (
          <Link to={`/${citySlug}/complaints`}
            className="shrink-0 w-28 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-2xl">→</Link>
        )}
      </div>
    </section>
  );
}
