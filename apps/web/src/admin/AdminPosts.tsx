import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postAnalytics, setListingPinned } from '../lib/listings';

interface Row {
  listing_id: string;
  title: string | null;
  kind: string | null;
  city: string | null;
  landings: number;
  visitors: number;
  views: number;
  contacts: number;
  contact_actions: number;
  created_at: string | null;
  pinned: boolean;
  self_posted: boolean;
}

const KIND: Record<string, string> = {
  business: 'Business', job_opening: 'Hiring', job_seeker: 'Job Seeker', happening: 'Happening',
};

type SortKey = 'landings' | 'visitors' | 'views' | 'contacts';

export function AdminPosts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  // Click a numeric header to sort by it; click again to flip direction.
  const [sortKey, setSortKey] = useState<SortKey>('visitors');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    postAnalytics().then((r) => setRows(r.results)).catch((e) => setErr(e?.message || 'Failed to load'));
  }, []);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Pin / unpin. Optimistic — the row jumps to the top immediately, and rolls
  // back if the server refuses.
  const [pinning, setPinning] = useState('');
  const togglePin = async (r: Row) => {
    const next = !r.pinned;
    setPinning(r.listing_id);
    setRows((rs) => (rs || []).map((x) => (x.listing_id === r.listing_id ? { ...x, pinned: next } : x)));
    try { await setListingPinned(r.listing_id, next); }
    catch (e: any) {
      setRows((rs) => (rs || []).map((x) => (x.listing_id === r.listing_id ? { ...x, pinned: !next } : x)));
      setErr(e?.message || 'Could not pin');
    } finally { setPinning(''); }
  };

  const shown = (rows || [])
    .filter((r) => !q.trim() || (r.title || '').toLowerCase().includes(q.trim().toLowerCase()))
    // Pinned always lead, whatever column you sort by — otherwise you'd lose
    // sight of what you've pinned.
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -diff : diff;
    });
  const pinnedCount = (rows || []).filter((r) => r.pinned).length;
  const totals = (rows || []).reduce(
    (a, r) => ({ landings: a.landings + r.landings, visitors: a.visitors + r.visitors, contacts: a.contacts + r.contacts }),
    { landings: 0, visitors: 0, contacts: 0 },
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <div className="flex items-center justify-between mt-2 mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Post analytics {rows && <span className="text-sm font-normal text-slate-500">· {rows.length} live posts</span>}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Per-post reach — click a column to sort. Pin a post to make it lead its category.
              {rows && <> Totals: {totals.landings} link landings · {totals.visitors} visitors · {totals.contacts} contacted{pinnedCount ? ` · ${pinnedCount} pinned` : ''}.</>}
            </p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by post…"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-52" />
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!rows && !err && <div className="text-slate-500">Loading…</div>}

        {rows && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Post</th>
                  <SortTh label="Landings" k="landings" cur={sortKey} dir={sortDir} onSort={sortBy} title="Sessions that arrived directly on this post via a shared link" />
                  <SortTh label="Visitors" k="visitors" cur={sortKey} dir={sortDir} onSort={sortBy} title="Distinct people who opened this post" />
                  <SortTh label="Views" k="views" cur={sortKey} dir={sortDir} onSort={sortBy} title="Total opens (a person can open more than once)" />
                  <SortTh label="Contacted" k="contacts" cur={sortKey} dir={sortDir} onSort={sortBy} title="Distinct people who actually called / WhatsApp'd / copied the number (not just revealed it)" />
                  <th className="px-3 py-2 font-medium text-right" title="Pinned posts lead their category — but only where they're already relevant">Pin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.listing_id} className={r.pinned ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2">
                      <Link to={`/admin/listings/${r.listing_id}`} className="font-medium text-brand hover:underline">{r.title || 'Untitled'}</Link>
                      <div className="text-[11px] text-slate-400">
                        {KIND[r.kind || ''] || r.kind || '—'}{r.city ? ` · ${r.city}` : ''}
                        {/* Who put it here matters: self-posted ranks above admin-keyed. */}
                        {r.self_posted && <span className="ml-1 text-emerald-600">· self-posted</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.landings}</td>
                    <td className="px-3 py-2 text-right text-slate-700 font-medium">{r.visitors}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{r.views}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.contacts}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => togglePin(r)} disabled={pinning === r.listing_id}
                        title={r.pinned ? 'Unpin' : 'Pin to the top of its category'}
                        className={`rounded-md px-2 py-1 text-xs font-medium border disabled:opacity-50 ${
                          r.pinned ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}>
                        {r.pinned ? '📌 Pinned' : 'Pin'}
                      </button>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No posts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

// A right-aligned, clickable column header. Shows ▲/▼ on the active column and a
// faint ↕ hint on the others so it's clear every numeric column is sortable.
function SortTh({ label, k, cur, dir, onSort, title }: {
  label: string; k: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; title?: string;
}) {
  const active = cur === k;
  return (
    <th className="px-3 py-2 font-medium text-right" title={title}>
      <button type="button" onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${active ? 'text-brand' : ''}`}>
        {label}
        <span className={active ? 'text-brand' : 'text-slate-300'}>{active ? (dir === 'desc' ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  );
}
