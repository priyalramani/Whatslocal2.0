import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface VisitorRow {
  id: string;
  visitor_id: string;
  identified: boolean;
  user_id: string | null;
  mobile: string | null;
  gender: string;
  events: number;
  sessions: number;
  first_seen: string;
  last_seen: string;
  langs: string[];
  city: string | null;
  device: string | null;
  brand: string | null;
  income: 'High' | 'Mid' | 'Low';
  income_score: number;
  listing_views: number;
  contacts: number;
  searches: number;
}
interface VisitorsResp { page: number; page_size: number; total: number; results: VisitorRow[] }

const fmt = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// Affluence tier → pill colour. Estimated from device brand + language + interests.
const incomePill: Record<string, string> = {
  High: 'bg-emerald-100 text-emerald-700',
  Mid: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
};

// Self-reported gender (from the gender prompt). Empty = not answered yet.
const GENDER: Record<string, { label: string; sym: string; cls: string }> = {
  male: { label: 'Male', sym: '♂', cls: 'bg-blue-100 text-blue-700' },
  female: { label: 'Female', sym: '♀', cls: 'bg-pink-100 text-pink-700' },
  other: { label: 'Other', sym: '⚧', cls: 'bg-purple-100 text-purple-700' },
};
export function GenderPill({ g }: { g: string }) {
  const m = GENDER[g];
  if (!m) return <span className="text-slate-300">—</span>;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.sym} {m.label}</span>;
}

export function AdminVisitors() {
  const [data, setData] = useState<VisitorsResp | null>(null);
  const [page, setPage] = useState(1);
  const [identifiedOnly, setIdentifiedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null); setErr('');
    api<VisitorsResp>(`/analytics/visitors?page=${page}${identifiedOnly ? '&identified=1' : ''}`)
      .then(setData)
      .catch((e) => setErr(e?.message || 'Failed to load'));
  }, [page, identifiedOnly]);

  const rows = (data?.results || []).filter((r) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (r.mobile || '').includes(needle) || r.visitor_id.toLowerCase().includes(needle);
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-slate-800">
            Visitors {data && <span className="text-sm font-normal text-slate-500">· {data.total} total</span>}
          </h1>
          <div className="flex items-center gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by mobile / id…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={identifiedOnly} onChange={(e) => { setIdentifiedOnly(e.target.checked); setPage(1); }} />
              Logged-in only
            </label>
          </div>
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!data && !err && <div className="text-slate-500">Loading…</div>}

        {data && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Visitor</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2 font-medium text-right">Views</th>
                  <th className="px-3 py-2 font-medium text-right">Contacts</th>
                  <th className="px-3 py-2 font-medium text-right">Searches</th>
                  <th className="px-3 py-2 font-medium text-right">Sessions</th>
                  <th className="px-3 py-2 font-medium">Lang</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Gender</th>
                  <th className="px-3 py-2 font-medium">Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link to={`/admin/visitors/${r.id}`} className="font-medium text-brand hover:underline">
                        {r.identified ? `📱 ${r.mobile || 'User'}` : '👤 Anonymous'}
                      </Link>
                      <div className="text-[11px] text-slate-400 font-mono">{r.visitor_id.slice(0, 12)}…{r.city ? ` · ${r.city}` : ''}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmt(r.last_seen)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.listing_views}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.contacts}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.searches}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.sessions}</td>
                    <td className="px-3 py-2 text-slate-600 uppercase">{r.langs.join('/') || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 capitalize">{r.device || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.brand || '—'}</td>
                    <td className="px-3 py-2"><GenderPill g={r.gender} /></td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${incomePill[r.income] || incomePill.Low}`}>
                        {r.income} · {r.income_score}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">No visitors yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">← Prev</button>
            <span className="text-slate-500">Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next →</button>
          </div>
        )}
      </main>
    </div>
  );
}
