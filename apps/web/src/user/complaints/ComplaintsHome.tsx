import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { resolveCity } from '../../lib/city';
import { useSmartBack } from '../../lib/useSmartBack';
import { useT } from '../../lib/i18n';
import { BottomNav } from '../BottomNav';
import { getWards, type WardRow } from '../../lib/complaints';

// Ward directory. Wards are grouped by their body (town / gram panchayat) since
// ward numbers repeat across towns (Gondia ward 1 ≠ Tirora ward 1). Tap a ward
// to open its board.
export function ComplaintsHome() {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const { t } = useT();
  const back = useSmartBack(`/${city.slug}`);
  const [wards, setWards] = useState<WardRow[] | null>(null);

  useEffect(() => { getWards(city.name).then(setWards).catch(() => setWards([])); }, [city.name]);

  const groups = useMemo(() => {
    const m = new Map<string, { taluka: string; wards: WardRow[] }>();
    (wards || []).forEach((w) => {
      const g = m.get(w.body) || { taluka: w.taluka, wards: [] };
      g.wards.push(w); m.set(w.body, g);
    });
    return [...m.entries()].map(([body, g]) => ({ body, taluka: g.taluka, wards: g.wards }));
  }, [wards]);
  const multi = groups.length > 1;

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-5 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={back} aria-label="Back" className="text-white/80 text-lg">←</button>
            <div className="font-semibold text-lg">🏛️ {t('cmp.title')}</div>
          </div>
          <p className="text-[12px] text-white/75 mt-1">{t('cmp.pickWard')}</p>
        </header>

        <main className="flex-1 px-4 py-4 pb-24">
          {wards === null && <div className="text-slate-400 text-sm text-center py-10">{t('common.loading')}</div>}
          {wards && wards.length === 0 && <div className="text-slate-400 text-sm text-center py-12">{t('cmp.noWards')}</div>}

          {groups.map((g) => (
            <div key={g.body} className="mb-5">
              {multi && (
                <div className="px-1 mb-2 text-[13px] font-semibold text-slate-700">
                  {g.body}{g.taluka && g.taluka !== g.body ? ` · ${g.taluka}` : ''}
                </div>
              )}
              <div className="space-y-2.5">
                {g.wards.map((w) => (
                  <Link key={w.id} to={`/${city.slug}/complaints/ward/${w.id}`}
                    className="block bg-white rounded-xl border border-slate-200 p-3.5 active:scale-[.99]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">{t('cmp.ward')} {w.number}{w.name ? ` · ${w.name}` : ''}</div>
                        {w.address && <div className="text-[12px] text-slate-500 mt-0.5">📍 {w.address}</div>}
                        {w.members.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-1 truncate">
                            {t('cmp.wardMember')}: {w.members.map((m) => m.name).filter(Boolean).join(', ') || '—'}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {w.open > 0 && <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium px-2 py-0.5">{w.open} {t('cmp.open').toLowerCase()}</span>}
                        <div className="text-brand text-lg mt-1">›</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
