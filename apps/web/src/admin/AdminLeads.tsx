import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsLeads } from '../lib/listings';

interface Lead {
  ts: string;
  target: string;
  identified: boolean;
  viewer_user_id: string | null;
  viewer_mobile: string | null;
  viewer_visitor_id: string;
  listing_id: string | null;
  listing_title: string | null;
  listing_kind: string | null;
  listing_slug: string | null;
}
interface LeadsResp { page: number; page_size: number; total: number; results: Lead[] }

const fmt = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// Contact action → readable label + colour. These are the billable "interest"
// signals: someone who reveals/calls/WhatsApps a post is a warm lead.
const ACTION: Record<string, { label: string; cls: string }> = {
  open: { label: '👁 Revealed number', cls: 'bg-slate-100 text-slate-600' },
  call: { label: '📞 Called', cls: 'bg-emerald-100 text-emerald-700' },
  whatsapp: { label: '💬 WhatsApp', cls: 'bg-green-100 text-green-700' },
  copy: { label: '📋 Copied number', cls: 'bg-amber-100 text-amber-700' },
  share: { label: '🔗 Shared', cls: 'bg-sky-100 text-sky-700' },
  cta: { label: '🔘 CTA', cls: 'bg-slate-100 text-slate-600' },
  cta2: { label: '🔘 CTA', cls: 'bg-slate-100 text-slate-600' },
  directions: { label: '🧭 Directions', cls: 'bg-slate-100 text-slate-600' },
};

export function AdminLeads() {
  const [data, setData] = useState<LeadsResp | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null); setErr('');
    analyticsLeads(page).then(setData).catch((e) => setErr(e?.message || 'Failed to load'));
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-slate-800">
            Contact leads {data && <span className="text-sm font-normal text-slate-500">· {data.total} total</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Who acted on a post's contact and how — the interest signal to charge on later. Newest first.</p>
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!data && !err && <div className="text-slate-500">Loading…</div>}

        {data && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Interested person</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">On post</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((r, i) => {
                  const a = ACTION[r.target] || { label: r.target, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmt(r.ts)}</td>
                      <td className="px-3 py-2">
                        {r.identified
                          ? <Link to={`/admin/visitors/${r.viewer_user_id}`} className="font-medium text-brand hover:underline">📱 {r.viewer_mobile || 'User'}</Link>
                          : <Link to={`/admin/visitors/${r.viewer_visitor_id}`} className="text-slate-600 hover:underline">👤 Anonymous</Link>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${a.cls}`}>{a.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.listing_id
                          ? <Link to={`/admin/listings/${r.listing_id}`} className="text-brand hover:underline">{r.listing_title || 'a listing'}</Link>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {data.results.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No contact activity yet.</td></tr>
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
