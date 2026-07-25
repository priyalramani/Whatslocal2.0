import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveCity } from '../lib/city';
import { useT } from '../lib/i18n';
import { useSmartBack } from '../lib/useSmartBack';
import { currentSession } from '../lib/userAuth';
import {
  searchTrips, tripRoutes, myTrips, createTrip, repostTrip,
  istToday, VEHICLES, type Trip, type MyTrip,
} from '../lib/trips';
import { BottomNav } from './BottomNav';
import { BRAND } from '../lib/brand';
import { OtpLogin } from './OtpLogin';

// People travel the same route over and over (Gondia→Nagpur and back), so we
// remember the last route on the DEVICE — no login needed, and it survives for
// unidentified visitors too. Date is deliberately NOT remembered: it goes stale.
const ROUTE_KEY = 'wl_cab_route';
export const lastRoute = (): { from?: string; to?: string } => {
  try { return JSON.parse(localStorage.getItem(ROUTE_KEY) || '{}'); } catch { return {}; }
};
const saveRoute = (from: string, to: string) => {
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify({ from, to })); } catch { /* private mode */ }
};

// CAB SHARING — one-way taxi seats from travel operators. Everything here is
// perishable, so the list is route+date first and expired trips never show.
export function Cabs() {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const { t } = useT();
  const back = useSmartBack(`/${city.slug}`);

  const [from, setFrom] = useState(() => lastRoute().from || '');
  const [to, setTo] = useState(() => lastRoute().to || '');
  // Trips are day-specific, so an empty date isn't a useful default — open on
  // today. (The route IS remembered; the date deliberately isn't — it goes stale.)
  const [date, setDate] = useState(istToday());
  const [routes, setRoutes] = useState<{ from: string[]; to: string[] }>({ from: [], to: [] });
  const [rows, setRows] = useState<Trip[] | null>(null);
  const [tab, setTab] = useState<'find' | 'mine'>('find');
  const [mine, setMine] = useState<MyTrip[] | null>(null);
  const [post, setPost] = useState(false);
  const [login, setLogin] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => searchTrips({ from, to, date, city: city.name }).then((r) => setRows(r.results)).catch(() => setRows([]));
  useEffect(() => { tripRoutes().then((r) => setRoutes({ from: r.from, to: r.to })).catch(() => {}); }, []);
  // Re-search whenever the route/date changes — and remember the route, so the
  // next visit opens straight on it.
  useEffect(() => { load(); saveRoute(from, to); }, [from, to, date]); // eslint-disable-line
  const loadMine = () => myTrips().then((r) => setMine(r.results)).catch(() => setMine([]));
  useEffect(() => { if (tab === 'mine') loadMine(); }, [tab]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };
  // Remember what the user was trying to do, and RESUME it after login —
  // otherwise logging in just closes the popup and the post form never opens.
  const pending = useRef<null | (() => void)>(null);
  const needLogin = (fn: () => void) => {
    if (currentSession()) { fn(); return; }
    pending.current = fn;
    setLogin(true);
  };
  // NB: the header is `text-white`, so these controls MUST set their own text
  // colour — otherwise white-on-white makes them look blank.
  const sel = 'rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-800 bg-white outline-none focus:border-brand';

  const fmtTime = (a: string, b: string) => [a, b].filter(Boolean).join(' – ');
  const fmtDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}`; };

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-4 pb-4 rounded-b-3xl shadow-lg shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={back} aria-label={t('common.back')} className="text-white/80 text-lg">←</button>
            <div>
              <div className="font-semibold text-lg">🚕 {t('cab.title')}</div>
              <div className="text-[11px] text-white/70">{city.name} · {t('cab.sub')}</div>
            </div>
          </div>
          {/* Route search — the only axis that matters here */}
          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={sel}>
              <option value="">{t('cab.from')}: {t('cab.any')}</option>
              {routes.from.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={sel}>
              <option value="">{t('cab.to')}: {t('cab.any')}</option>
              {routes.to.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={load} className="rounded-lg bg-white text-brand font-semibold px-3 text-sm">🔍</button>
          </div>
          <DateCell value={date} min={istToday()} onChange={setDate} className={`mt-2 w-full ${sel}`} />
        </header>

        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {(['find', 'mine'] as const).map((k) => (
            <button key={k} onClick={() => (k === 'mine' ? needLogin(() => setTab('mine')) : setTab('find'))}
              className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${tab === k ? 'bg-brand text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {k === 'find' ? t('cab.find') : t('cab.mine')}
            </button>
          ))}
        </div>

        <main className="flex-1 px-4 py-3 pb-28 space-y-2.5">
          {tab === 'find' && rows === null && <div className="text-center text-slate-400 text-sm py-10">{t('common.loading')}</div>}
          {tab === 'find' && rows && rows.length === 0 && (
            <div className="text-center py-14"><div className="text-3xl mb-2">🚕</div>
              <div className="text-slate-400 text-sm">{t('cab.none')}</div></div>
          )}
          {tab === 'find' && rows?.map((r) => (
            <TripCard key={r._id} tr={r} t={t} fmtTime={fmtTime} fmtDate={fmtDate} />
          ))}

          {tab === 'mine' && mine === null && <div className="text-center text-slate-400 text-sm py-10">{t('common.loading')}</div>}
          {tab === 'mine' && mine?.length === 0 && <div className="text-center text-slate-400 text-sm py-10">{t('cab.none')}</div>}
          {tab === 'mine' && mine?.map((r) => (
            <div key={r._id} className={`rounded-2xl bg-white border border-slate-100 shadow-card p-3 ${r.expired ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900 text-[15px]">{r.from_city} → {r.to_city}</div>
                {r.expired && <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{t('cab.expired')}</span>}
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">{fmtDate(r.date)} · {fmtTime(r.time_from, r.time_to)}</div>
              <button
                onClick={() => repostTrip(r._id, { date: istToday() }).then(() => { flash(t('cab.repostedFor', { d: fmtDate(istToday()) })); loadMine(); load(); }).catch(() => {})}
                className="mt-2.5 w-full rounded-lg border border-brand text-brand text-sm font-medium py-2">
                ↻ {t('cab.repost')}
              </button>
            </div>
          ))}
        </main>

        {/* Operators post many times a day — keep this one tap away, always. */}
        <button onClick={() => needLogin(() => setPost(true))}
          className="fixed bottom-[68px] left-1/2 -translate-x-1/2 z-30 rounded-full bg-brand text-white font-semibold px-6 py-3 shadow-xl">
          ＋ {t('cab.post')}
        </button>

        {toast && (
          <div className="fixed bottom-[130px] left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white text-sm rounded-full px-4 py-2 shadow-lg">{toast}</div>
        )}

        {post && <PostTrip city={city.name} onClose={() => setPost(false)}
          onDone={() => { setPost(false); flash(t('cab.posted')); load(); }} />}
        {login && (
          <OtpLogin title={t('cab.loginToPost')}
            onSuccess={() => { setLogin(false); const fn = pending.current; pending.current = null; fn?.(); }}
            onClose={() => { pending.current = null; setLogin(false); }} />
        )}

        <BottomNav />
      </div>
    </div>
  );
}

// "Friday, 24 July 2026" — a traveller thinks in weekdays, not in dd/mm/yyyy.
// Built piecewise because no single locale gives exactly this shape.
export const fmtLongDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { timeZone: 'Asia/Kolkata' } as const;
  const wd = d.toLocaleDateString('en-GB', { ...opts, weekday: 'long' });
  const rest = d.toLocaleDateString('en-GB', { ...opts, day: 'numeric', month: 'long', year: 'numeric' });
  return `${wd}, ${rest}`;
};

// A date cell that READS like a date but still opens the platform picker: the
// real <input type="date"> sits invisibly on top of the formatted text.
function DateCell({ value, min, onChange, className = '' }: {
  value: string; min?: string; onChange: (v: string) => void; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="block truncate">{fmtLongDate(value)}</span>
      <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" />
    </div>
  );
}

// "Till 24 Jul, 04:00 pm" — read in IST, since that's the only clock that matters.
const fmtExpiry = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

function TripCard({ tr, t, fmtTime, fmtDate }: any) {
  const wa = tr.whatsapp || tr.mobile;
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-[15px] leading-snug">{tr.from_city} → {tr.to_city}</div>
          {tr.via && <div className="text-[11px] text-slate-400 mt-0.5">via {tr.via}</div>}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {tr.recurring && <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">{t('cab.daily')}</span>}
          {tr.one_way && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{t('cab.oneWay')}</span>}
        </div>
      </div>
      <div className="text-[12.5px] text-slate-600 mt-1.5">
        {/* Recurring operators run every day — show that, not a single date. */}
        📅 {tr.recurring ? t('cab.everyDay') : fmtDate(tr.date)} {tr.time_from && <>· 🕐 {fmtTime(tr.time_from, tr.time_to)}</>}
      </div>
      {/* A one-off cab post is perishable — say when it stops being callable.
          A recurring operator never expires, so no "valid till" line. */}
      {!tr.recurring && tr.expires_at && <div className="text-[11px] text-amber-600 mt-0.5">{t('cab.till', { time: fmtExpiry(tr.expires_at) })}</div>}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {tr.vehicle && <span className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5">🚗 {tr.vehicle}</span>}
        {tr.seats && <span className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5">{t('cab.seats', { n: tr.seats })}</span>}
        <span className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5">
          {tr.fare ? `₹${tr.fare}` : t('cab.callForPrice')}
        </span>
      </div>
      {tr.note && <div className="text-[12px] text-slate-500 mt-1.5">{tr.note}</div>}
      {tr.operator_name && <div className="text-[12px] text-slate-500 mt-2">{tr.operator_name}</div>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <a href={`tel:${tr.mobile}`} className="text-center rounded-xl bg-brand text-white font-semibold py-2.5 text-sm">📞 {t('detail.call')}</a>
        {/* Operators field a lot of these — lead with the route and date so they
            can answer without asking which trip it is. */}
        <a href={`https://wa.me/91${wa}?text=${encodeURIComponent(t('wa.msg.cab', {
          from: tr.from_city, to: tr.to_city, date: fmtLongDate(tr.date) || fmtDate(tr.date),
          brand: BRAND.displayName, city: tr.city || '',
        }))}`} target="_blank" rel="noopener noreferrer"
          className="text-center rounded-xl border border-slate-200 text-slate-600 font-medium py-2.5 text-sm">WhatsApp</a>
      </div>
    </div>
  );
}

// Post form — deliberately short. Operators repost daily; if this is slower than
// pasting a template into WhatsApp, they won't switch.
function PostTrip({ city, onClose, onDone }: { city: string; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const s = currentSession();
  // Operators run the same route every day — start them on their last one.
  const [f, setF] = useState<any>({
    from_city: lastRoute().from || '', to_city: lastRoute().to || '',
    via: '', date: istToday(), time_from: '', time_to: '',
    vehicle: 'Dzire', seats: '', fare: '', note: '', operator_name: '', mobile: s?.mobile || '',
    recurring: false,
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand';

  async function submit() {
    setErr('');
    if (!f.from_city.trim() || !f.to_city.trim()) { setErr('Enter both cities'); return; }
    if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(f.mobile)) { setErr('Enter a valid mobile number'); return; }
    setBusy(true);
    try {
      await createTrip({
        from_city: f.from_city.trim(), to_city: f.to_city.trim(), via: f.via.trim() || undefined,
        date: f.date, time_from: f.time_from || undefined, time_to: f.time_to || undefined,
        vehicle: f.vehicle, seats: f.seats ? Number(f.seats) : undefined,
        fare: f.fare ? Number(f.fare) : undefined, note: f.note.trim() || undefined,
        operator_name: f.operator_name.trim() || undefined, mobile: f.mobile, city,
        recurring: !!f.recurring,
      });
      onDone();
    } catch (e: any) { setErr(e?.message || 'Could not post'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="text-lg font-semibold text-slate-900 mb-3">{t('cab.postTitle')}</div>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder={t('cab.from')} value={f.from_city} onChange={(e) => set('from_city', e.target.value)} />
            <input className={inp} placeholder={t('cab.to')} value={f.to_city} onChange={(e) => set('to_city', e.target.value)} />
          </div>
          <input className={inp} placeholder={t('cab.via')} value={f.via} onChange={(e) => set('via', e.target.value)} />
          {/* A daily travel operator runs this route every day — no per-day date
              or expiry. Individual shared seats stay unchecked. */}
          <label className="flex items-center gap-2 text-sm text-slate-700 py-0.5">
            <input type="checkbox" checked={!!f.recurring} onChange={(e) => set('recurring', e.target.checked)} />
            🔁 {t('cab.runsDaily')}
          </label>
          {!f.recurring && <DateCell value={f.date} min={istToday()} onChange={(v) => set('date', v)} className={inp} />}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">{t('cab.timeFrom')}
              <input className={inp} type="time" value={f.time_from} onChange={(e) => set('time_from', e.target.value)} /></label>
            <label className="text-[11px] text-slate-500">{t('cab.timeTo')}
              <input className={inp} type="time" value={f.time_to} onChange={(e) => set('time_to', e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className={inp} value={f.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
              {VEHICLES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input className={inp} inputMode="numeric" placeholder={t('cab.seats', { n: '' }).trim()} value={f.seats} onChange={(e) => set('seats', e.target.value.replace(/\D/g, ''))} />
          </div>
          <input className={inp} inputMode="numeric" placeholder={t('cab.fare')} value={f.fare} onChange={(e) => set('fare', e.target.value.replace(/\D/g, ''))} />
          <input className={inp} placeholder={t('cab.operator')} value={f.operator_name} onChange={(e) => set('operator_name', e.target.value)} />
          <input className={inp} inputMode="numeric" placeholder="Mobile" value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} />
          <input className={inp} placeholder={t('cab.note')} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        <button onClick={submit} disabled={busy}
          className="mt-4 w-full rounded-xl bg-brand text-white font-semibold py-3 disabled:opacity-50">
          {busy ? '…' : t('cab.submit')}
        </button>
      </div>
    </div>
  );
}
