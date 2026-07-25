import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminReports, reportAction } from '../lib/listings';

const LABEL: Record<string, string> = {
  wrong_info: 'Wrong information', scam: 'Scam / fraud', spam: 'Spam',
  duplicate: 'Duplicate', offensive: 'Offensive', other: 'Other',
};
const ACTION_LABEL: Record<string, string> = {
  hide: 'Hidden post', show: 'Un-hid post', restrict: 'Restricted user',
  unrestrict: 'Un-restricted user', reviewed: 'Marked reviewed',
};
const fmt = (d: any) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function AdminReports() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try { setRows(await adminReports()); } catch (e: any) { setErr(e?.message || 'Failed'); }
  }
  useEffect(() => { load(); }, []);

  async function act(listingId: string, action: string) {
    setBusy(listingId + action);
    try { await reportAction(listingId, action); await load(); }
    catch (e: any) { setErr(e?.message || 'Action failed'); }
    finally { setBusy(''); }
  }

  const Btn = ({ g, action, label, cls }: { g: any; action: string; label: string; cls: string }) => (
    <button disabled={busy === g.listing_id + action} onClick={() => act(g.listing_id, action)}
      className={`rounded-lg text-sm px-3.5 py-1.5 disabled:opacity-50 ${cls}`}>
      {busy === g.listing_id + action ? '…' : label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-800 mb-4">Reported listings</h1>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!rows && <div className="text-slate-500">Loading…</div>}
        {rows && rows.length === 0 && <div className="text-slate-400">No open reports. 🎉</div>}

        <div className="space-y-4">
          {rows?.map((g) => {
            const l = g.listing;
            const hidden = l && !l.active;
            return (
              <div key={g.listing_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header: listing + status */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                        {l ? <Link to={`/admin/listings/${g.listing_id}`} className="hover:underline">{l.title}</Link> : '(deleted listing)'}
                        <span className="text-[11px] bg-red-50 text-red-600 rounded-full px-2 py-0.5">{g.reporters.length} report{g.reporters.length > 1 ? 's' : ''}</span>
                        {hidden && <span className="text-[11px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">Hidden</span>}
                        {g.poster_blocked && <span className="text-[11px] bg-rose-100 text-rose-700 rounded-full px-2 py-0.5">User restricted</span>}
                      </div>
                      {l && <div className="text-xs text-slate-500 mt-0.5">📞 {g.poster_mobile || l.mobile} · {l.city} · {l.status}</div>}
                    </div>
                  </div>
                </div>

                {/* Reporters */}
                <div className="px-4 py-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reported by</div>
                  {g.reporters.map((r: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{r.mobile}</span>
                        <span className="text-xs bg-red-50 text-red-600 rounded-full px-2 py-0.5 ml-2">{LABEL[r.reason] || r.reason}</span>
                        {r.total_reports >= 3 && (
                          <span className="text-[11px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 ml-1" title="Possible serial reporter">⚠ {r.total_reports} reports filed</span>
                        )}
                        {r.total_reports < 3 && <span className="text-[11px] text-slate-400 ml-1">({r.total_reports} filed)</span>}
                        {r.details && <div className="text-slate-600 mt-0.5">“{r.details}”</div>}
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0">{fmt(r.at)}</div>
                    </div>
                  ))}
                </div>

                {/* Action history */}
                {g.actions.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">History</div>
                    <div className="space-y-0.5">
                      {g.actions.map((a: any, i: number) => (
                        <div key={i} className="text-[11px] text-slate-500">
                          {fmt(a.at)} — <b>{ACTION_LABEL[a.action] || a.action}</b> by {a.admin}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100">
                  {hidden
                    ? <Btn g={g} action="show" label="Un-hide post" cls="border border-slate-300 text-slate-700 hover:bg-white" />
                    : <Btn g={g} action="hide" label="Hide post" cls="bg-slate-800 text-white hover:bg-slate-700" />}
                  {g.poster_blocked
                    ? <Btn g={g} action="unrestrict" label="Un-restrict user" cls="border border-slate-300 text-slate-700 hover:bg-white" />
                    : <Btn g={g} action="restrict" label="Restrict user" cls="bg-rose-600 text-white hover:bg-rose-700" />}
                  <div className="ml-auto">
                    <Btn g={g} action="reviewed" label="Mark reviewed" cls="border border-slate-300 text-slate-600 hover:bg-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
