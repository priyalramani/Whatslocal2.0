import { useEffect, useState } from 'react';
import { userReport, contactReport, type UserReport, type ContactReport } from '../lib/listings';

// Two reports over the same date range, switched by a tab:
//   1. Visitor report — day-wise visitors, NEW vs REPEAT.
//   2. Contact report — day-wise contact actions, CALL / WHATSAPP / COPY.
// Both render through one stacked-bar component, so they stay consistent.
//
// Colours are validated categorical slots (CVD-safe against each other and the
// surface); identity is never colour-alone — every chart ships a legend, value
// labels and a table view.
const NEW = '#1D9E75';        // teal
const REPEAT = '#7F77DD';     // violet
const CALL = '#2a78d6';       // blue
const WHATSAPP = '#1baf7a';   // green
const COPY = '#eb6834';       // orange

interface Series { key: string; label: string; color: string }
const VISITOR_SERIES: Series[] = [
  { key: 'new', label: 'New', color: NEW },
  { key: 'repeat', label: 'Repeat', color: REPEAT },
];
const CONTACT_SERIES: Series[] = [
  { key: 'call', label: 'Call', color: CALL },
  { key: 'whatsapp', label: 'WhatsApp', color: WHATSAPP },
  { key: 'copy', label: 'Copy', color: COPY },
];

// IST "today" and the Monday of the current week (the default range).
const IST = 5.5 * 60 * 60 * 1000;
const istKey = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
function thisWeek(): { from: string; to: string } {
  const now = Date.now();
  const ist = new Date(now + IST);
  const dow = (ist.getUTCDay() + 6) % 7;               // 0 = Monday
  return { from: istKey(now - dow * 86400000), to: istKey(now) };
}
const dayLabel = (s: string) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

export function AdminUserReport() {
  const init = thisWeek();
  const [tab, setTab] = useState<'visitors' | 'contacts'>('visitors');
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [users, setUsers] = useState<UserReport | null>(null);
  const [contacts, setContacts] = useState<ContactReport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Both reports load together — the range control is shared, and switching
  // tabs should be instant rather than triggering another round-trip.
  async function load(f = from, t = to) {
    setBusy(true); setErr('');
    try {
      const [u, c] = await Promise.all([userReport(f, t), contactReport(f, t)]);
      setUsers(u); setContacts(c);
    } catch (e: any) { setErr(e?.message || 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(init.from, init.to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = (n: number) => {
    const t = istKey(Date.now()); const f = istKey(Date.now() - (n - 1) * 86400000);
    setFrom(f); setTo(t); load(f, t);
  };

  const tabCls = (on: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${on ? 'bg-brand text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`;

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-slate-800">Reports</h1>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setTab('visitors')} className={tabCls(tab === 'visitors')}>Visitor report</button>
        <button onClick={() => setTab('contacts')} className={tabCls(tab === 'contacts')}>Contact report</button>
      </div>

      <p className="text-sm text-slate-500 mt-3">
        {tab === 'visitors'
          ? 'Day-wise visitors, split into first-time and returning.'
          : 'Day-wise contact actions, split by how they reached out.'}
      </p>

      {/* Filters — one row above the charts, shared by both reports */}
      <div className="flex flex-wrap items-end gap-3 mt-4">
        <label className="text-xs text-slate-500">From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`block mt-1 ${input}`} />
        </label>
        <label className="text-xs text-slate-500">To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`block mt-1 ${input}`} />
        </label>
        <button onClick={() => load()} disabled={busy}
          className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
          {busy ? 'Loading…' : 'Apply'}
        </button>
        <div className="flex gap-1.5 ml-auto">
          {[['This week', 0], ['7d', 7], ['30d', 30]].map(([lbl, n]) => (
            <button key={lbl as string}
              onClick={() => { if (n === 0) { const w = thisWeek(); setFrom(w.from); setTo(w.to); load(w.from, w.to); } else preset(n as number); }}
              className="rounded-lg border border-slate-300 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-50">{lbl as string}</button>
          ))}
        </div>
      </div>

      {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mt-4">{err}</div>}

      {tab === 'visitors' && users && (
        <>
          <Tiles tiles={[
            { k: 'Unique visitors', v: users.totals.unique },
            { k: 'New', v: users.totals.new, c: NEW },
            { k: 'Repeat', v: users.totals.repeat, c: REPEAT },
          ]} />
          <StackedBars days={users.days as any} series={VISITOR_SERIES} />
          <DataTable days={users.days as any} series={VISITOR_SERIES} />
          <p className="text-xs text-slate-400 mt-3">
            A visitor counts as <b>New</b> on the day they were first ever seen; on any later day they count as <b>Repeat</b>.
            Range totals count each person once. Days are IST.
          </p>
        </>
      )}

      {tab === 'contacts' && contacts && (
        <>
          <Tiles tiles={[
            { k: 'Contacts', v: contacts.totals.total },
            { k: 'Call', v: contacts.totals.call, c: CALL },
            { k: 'WhatsApp', v: contacts.totals.whatsapp, c: WHATSAPP },
            { k: 'Copy', v: contacts.totals.copy, c: COPY },
          ]} />
          <div className="text-xs text-slate-500 mt-2">
            From <b>{contacts.totals.people.toLocaleString('en-IN')}</b> people across{' '}
            <b>{contacts.totals.posts.toLocaleString('en-IN')}</b> posts.
          </div>
          <StackedBars days={contacts.days as any} series={CONTACT_SERIES} />
          <DataTable days={contacts.days as any} series={CONTACT_SERIES} />
          <p className="text-xs text-slate-400 mt-3">
            One count per person, per post, per day, per channel — tapping Call on the same shop repeatedly in one day
            counts <b>once</b>, the same shop <b>the next day</b> counts again, and different shops each count separately.
            Call and WhatsApp on one post count once each, since they are two separate attempts to reach someone.
            Days are IST.
          </p>
        </>
      )}
    </div>
  );
}

// ---- shared pieces ----

function Tiles({ tiles }: { tiles: { k: string; v: number; c?: string }[] }) {
  return (
    <div className={`grid gap-3 mt-5 ${tiles.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {tiles.map((s) => (
        <div key={s.k} className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {s.c && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />}{s.k}
          </div>
          <div className="text-2xl font-medium text-slate-900 mt-1">{s.v.toLocaleString('en-IN')}</div>
        </div>
      ))}
    </div>
  );
}

// One stacked bar per day. Segments stack in series order with a 2px surface gap
// between them, and the day total sits above the bar as a direct label.
function StackedBars({ days, series }: { days: Record<string, any>[]; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <>
      <div className="flex items-center gap-4 mt-6 mb-2 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
        <span className="ml-auto text-slate-400">Peak {max}</span>
      </div>

      <div className="relative rounded-xl border border-slate-200 bg-white px-3 pt-6 pb-2">
        <div className="flex items-end gap-1.5 h-56">
          {days.map((d, i) => {
            // Topmost non-zero segment gets the rounded cap.
            const stack = [...series].reverse().filter((s) => (d[s.key] || 0) > 0);
            return (
              <div key={d.day} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="text-[10px] text-slate-400 mb-1 tabular-nums">{d.total || ''}</div>
                <div className="w-full max-w-[38px] flex flex-col justify-end" style={{ height: '100%' }}>
                  {stack.map((s, j) => (
                    <div key={s.key}
                      style={{ height: `${(d[s.key] / max) * 100}%`, background: s.color, marginTop: j ? 2 : 0 }}
                      className={`w-full ${j === 0 ? 'rounded-t-[4px]' : ''}`}
                      title={`${s.label} ${d[s.key]}`} />
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5 tabular-nums">{dayLabel(d.day)}</div>
              </div>
            );
          })}
        </div>
        {hover !== null && days[hover] && (
          <div className="absolute top-2 right-3 rounded-lg bg-slate-900 text-white text-[11px] px-2.5 py-1.5 shadow-lg">
            <div className="font-medium">{days[hover].day}</div>
            <div className="text-slate-300">
              {series.map((s) => `${s.label} ${days[hover]![s.key]}`).join(' · ')} · Total {days[hover].total}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// The same data, readable without colour.
function DataTable({ days, series }: { days: Record<string, any>[]; series: Series[] }) {
  return (
    <table className="w-full text-sm mt-6">
      <thead>
        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
          <th className="py-2 font-medium">Day</th>
          {series.map((s) => <th key={s.key} className="py-2 font-medium text-right">{s.label}</th>)}
          <th className="py-2 font-medium text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day} className="border-b border-slate-100">
            <td className="py-2 text-slate-700">{d.day}</td>
            {series.map((s) => <td key={s.key} className="py-2 text-right tabular-nums text-slate-700">{d[s.key]}</td>)}
            <td className="py-2 text-right tabular-nums font-medium text-slate-900">{d.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
