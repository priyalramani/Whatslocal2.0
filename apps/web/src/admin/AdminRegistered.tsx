import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { registeredUsers } from '../lib/listings';

interface Row {
  user_id: string;
  mobile: string;
  blocked: boolean;
  registered_at: string;
  first_seen: string | null;
  last_seen: string | null;
  source: string;
  contacts_requested: number;
  time_spent_seconds: number;
  language: string | null;
  interest: string | null;
  income: 'High' | 'Mid' | 'Low';
  income_score: number;
  events: number;
}

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
const dur = (s: number) => (!s ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi' };
const incomePill: Record<string, string> = {
  High: 'bg-emerald-100 text-emerald-700',
  Mid: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
};

export function AdminRegistered() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    registeredUsers().then((r) => setRows(r.results)).catch((e) => setErr(e?.message || 'Failed to load'));
  }, []);

  const shown = (rows || []).filter((r) => !q.trim() || (r.mobile || '').includes(q.trim()));

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <div className="flex items-center justify-between mt-2 mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Registered users {rows && <span className="text-sm font-normal text-slate-500">· {rows.length}</span>}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Newest sign-ups first. Click a user for the full activity tracker.</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by mobile…"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-52" />
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!rows && !err && <div className="text-slate-500">Loading…</div>}

        {rows && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                  <th className="px-3 py-2 font-medium">First visit</th>
                  <th className="px-3 py-2 font-medium">Came from</th>
                  <th className="px-3 py-2 font-medium text-right" title="Posts whose number this user actually called / WhatsApp'd / copied">Contacted</th>
                  <th className="px-3 py-2 font-medium text-right">Time spent</th>
                  <th className="px-3 py-2 font-medium">Language</th>
                  <th className="px-3 py-2 font-medium">Interested in</th>
                  <th className="px-3 py-2 font-medium">Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.user_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link to={`/admin/visitors/${r.user_id}`} className="font-medium text-brand hover:underline">📱 {r.mobile || 'User'}</Link>
                      {r.blocked && <span className="ml-1.5 text-[10px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5">blocked</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{fmtDate(r.registered_at)}</td>
                    <td className="px-3 py-2 text-slate-600">{fmt(r.first_seen)}</td>
                    <td className="px-3 py-2 text-slate-500">{r.source}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.contacts_requested}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{dur(r.time_spent_seconds)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.language ? (LANG[r.language] || r.language) : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.interest || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${incomePill[r.income] || incomePill.Low}`}>
                        {r.income} · {r.income_score}
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No registered users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
