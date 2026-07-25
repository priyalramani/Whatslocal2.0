import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pendingListings, approveListing, rejectListing, checkDuplicate, type DupPosting } from '../lib/listings';

export function AdminApprovals() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [dups, setDups] = useState<Record<string, DupPosting[]>>({});
  const [err, setErr] = useState('');

  async function load() {
    try {
      const list = await pendingListings();
      setRows(list);
      // Flag likely duplicates: any OTHER listing (across all users, admin scope)
      // with the same number + kind — so the reviewer can open it before approving.
      const entries = await Promise.all(list.map(async (l: any) => {
        if (!l.mobile || !l.kind) return [l._id, [] as DupPosting[]] as const;
        try { const r = await checkDuplicate(l.mobile, l.kind, l._id, true); return [l._id, r.results] as const; }
        catch { return [l._id, [] as DupPosting[]] as const; }
      }));
      setDups(Object.fromEntries(entries));
    } catch (e: any) { setErr(e?.message || 'Failed'); }
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, fn: (id: string) => Promise<any>) {
    await fn(id);
    setRows((r) => (r ? r.filter((x) => x._id !== id) : r));
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-800 mb-4">Pending listings</h1>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!rows && <div className="text-slate-500">Loading…</div>}
        {rows && rows.length === 0 && <div className="text-slate-400">Nothing pending. 🎉</div>}

        <div className="space-y-3">
          {rows?.map((l) => (
            <div key={l._id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">
                    {l.title} <span className="text-xs text-slate-400">· {l.post_type || l.kind}</span>
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    📞 {l.mobile} · 📍 {[l.city, l.state].filter(Boolean).join(', ') || l.pincode}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    posted by {l.posted_by_mobile || (l.source === 'admin' ? 'admin' : '—')} · {l.source}
                  </div>
                  {!!l.keywords_cache?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {l.keywords_cache.map((k: string) => (
                        <span key={k} className="text-[11px] text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{k}</span>
                      ))}
                    </div>
                  )}
                  {l.description && <div className="text-sm text-slate-500 mt-2">{l.description}</div>}
                  {dups[l._id]?.length > 0 && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <div className="text-[12px] font-medium text-amber-800">
                        ⚠ Possible duplicate — this number already has {dups[l._id].length} listing{dups[l._id].length > 1 ? 's' : ''} of the same type:
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {dups[l._id].map((d) => (
                          <li key={d.id} className="text-[12px]">
                            <a href={`/admin/listings/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                              {d.title || 'Untitled'}<span className="uppercase text-[9px] text-slate-400 ml-1.5">{d.status}</span> ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Link to={`/admin/listings/${l._id}`}
                    className="rounded-lg border border-slate-300 text-slate-700 text-sm px-4 py-1.5 text-center hover:bg-slate-50">View / Edit</Link>
                  <button onClick={() => act(l._id, approveListing)}
                    className="rounded-lg bg-brand text-white text-sm px-4 py-1.5 hover:bg-brand-dark">Approve</button>
                  <button onClick={() => act(l._id, rejectListing)}
                    className="rounded-lg border border-slate-300 text-slate-600 text-sm px-4 py-1.5 hover:bg-slate-50">Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
