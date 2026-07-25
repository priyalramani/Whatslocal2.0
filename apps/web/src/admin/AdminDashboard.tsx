import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyticsSummary } from '@whatslocal/types';
import { api } from '../lib/api';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export function AdminDashboard() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<AnalyticsSummary>('/analytics/summary')
      .then(setData)
      .catch((e) => setErr(e?.message || 'Failed to load'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-800 mb-4">Analytics (last 30 days)</h1>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!data && !err && <div className="text-slate-500">Loading…</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/admin/visitors" className="block hover:ring-2 hover:ring-brand/30 rounded-xl transition">
                <Stat label="Unique visitors ›" value={data.unique_visitors} />
              </Link>
              <Link to="/admin/registered" className="block hover:ring-2 hover:ring-brand/30 rounded-xl transition">
                <Stat label="Registered users ›" value={data.registered_users} />
              </Link>
              <Link to="/admin/posts" className="block hover:ring-2 hover:ring-brand/30 rounded-xl transition">
                <Stat label="Posts ›" value={data.total_posts} />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-800 mb-2">
                  Zero-result searches
                  <span className="text-xs font-normal text-slate-500"> — what to add next</span>
                </div>
                {data.zero_result_searches.length === 0 && <div className="text-sm text-slate-400">None yet.</div>}
                <ul className="text-sm divide-y divide-slate-100">
                  {data.zero_result_searches.map((s) => (
                    <li key={s.query} className="flex justify-between py-1.5">
                      <span className="text-slate-700">{s.query}</span>
                      <span className="text-slate-400">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-800 mb-2">Top searches</div>
                {data.top_searches.length === 0 && <div className="text-sm text-slate-400">None yet.</div>}
                <ul className="text-sm divide-y divide-slate-100">
                  {data.top_searches.map((s) => (
                    <li key={s.query} className="flex justify-between py-1.5">
                      <span className="text-slate-700">{s.query}</span>
                      <span className="text-slate-400">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-800 mb-2">Devices</div>
                <ul className="text-sm divide-y divide-slate-100">
                  {Object.entries(data.device_breakdown).map(([k, v]) => (
                    <li key={k} className="flex justify-between py-1.5">
                      <span className="text-slate-700 capitalize">{k}</span>
                      <span className="text-slate-400">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-800 mb-2">Events by day</div>
                <ul className="text-sm divide-y divide-slate-100">
                  {data.by_day.map((d) => (
                    <li key={d.day} className="flex justify-between py-1.5">
                      <span className="text-slate-700">{d.day}</span>
                      <span className="text-slate-400">{d.events} ev · {d.visitors} vis</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
