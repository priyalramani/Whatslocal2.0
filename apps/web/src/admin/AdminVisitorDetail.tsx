import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface KV { key: string; count: number }
interface Action { ts: string; target: string | null; listing_id: string | null; title: string | null; slug: string | null }
interface TimelineItem extends Action { type: string; path?: string; query?: string | null; result_count?: number | null; lang?: string | null; city?: string | null }
interface Detail {
  visitor_id: string;
  identified: boolean;
  user_id: string | null;
  mobile: string | null;
  blocked: boolean;
  first_seen: string;
  last_seen: string;
  total_events: number;
  sessions: number;
  engaged_seconds: number;
  counts: Record<string, number>;
  languages: KV[];
  last_lang: string | null;
  devices: KV[];
  cities: string[];
  current_city: string | null;
  entry: { path: string; referrer: string; ts: string; listing_id: string | null; title: string | null; slug: string | null } | null;
  income: { tier: 'High' | 'Mid' | 'Low'; score: number; brand: string | null; os: string | null };
  top_categories: { label: string; points: number }[];
  searches: { query: string; count: number; zero: boolean }[];
  actions: Action[];
  timeline: TimelineItem[];
}

const fmt = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const dur = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const TARGET: Record<string, string> = { call: '📞 Call', whatsapp: '💬 WhatsApp', share: '🔗 Share', open: '👁 Opened contact', copy: '📋 Copied number', cta: '🔘 CTA button', cta2: '🔘 CTA button', directions: '🧭 Directions' };
const TYPE: Record<string, string> = { page_view: 'Viewed page', listing_view: 'Opened listing', search: 'Searched', search_zero_results: 'Search · no results', contact_click: 'Contact action', featured_click: 'Tapped tile', post_start: 'Started a post', post_submit: 'Submitted a post' };
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi' };
// Estimated affluence tier → pill colour (device brand + language + interests).
const incomePill: Record<string, string> = {
  High: 'bg-emerald-100 text-emerald-700',
  Mid: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
};
const hostOf = (url?: string) => { try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return url || ''; } };

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="font-semibold text-slate-800 mb-2">{title}{sub && <span className="text-xs font-normal text-slate-500"> — {sub}</span>}</div>
      {children}
    </div>
  );
}

export function AdminVisitorDetail() {
  const { visitorId = '' } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Detail | null>(`/analytics/visitors/${encodeURIComponent(visitorId)}`)
      .then((r) => { if (!r) setErr('No activity found for this visitor.'); else setD(r); })
      .catch((e) => setErr(e?.message || 'Failed to load'));
  }, [visitorId]);

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Link to="/admin/visitors" className="text-sm text-brand hover:underline">← All visitors</Link>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 my-4">{err}</div>}
        {!d && !err && <div className="text-slate-500 mt-4">Loading…</div>}

        {d && (
          <>
            {/* Identity header */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mt-3 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xl font-bold text-slate-800">
                  {d.identified ? `📱 ${d.mobile || 'Logged-in user'}` : '👤 Anonymous visitor'}
                </div>
                {d.identified && <span className="text-[11px] rounded-full bg-green-100 text-green-700 px-2 py-0.5">Identified</span>}
                {d.blocked && <span className="text-[11px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">Restricted</span>}
                {d.current_city && <span className="text-[11px] rounded-full bg-brand/10 text-brand font-medium px-2 py-0.5">📍 {d.current_city} · now</span>}
                {d.cities.filter((c) => c !== d.current_city).map((c) => <span key={c} className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">📍 {c}</span>)}
                {d.income && (
                  <span className={`text-[11px] rounded-full font-medium px-2 py-0.5 ${incomePill[d.income.tier] || incomePill.Low}`}>
                    💰 {d.income.tier} income · {d.income.score}
                  </span>
                )}
                {d.income?.brand && <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">📱 {d.income.brand}</span>}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-1">{d.visitor_id}</div>
              <div className="text-xs text-slate-500 mt-2">First seen {fmt(d.first_seen)} · Last seen {fmt(d.last_seen)}</div>
              {d.entry && (
                <div className="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 inline-block">
                  🛬 First landed on{' '}
                  {d.entry.listing_id
                    ? <Link to={`/admin/listings/${d.entry.listing_id}`} className="text-brand font-medium hover:underline">{d.entry.title || 'a listing'}</Link>
                    : <span className="font-mono text-slate-700">{d.entry.path || '/'}</span>}
                  {' · '}<span className="text-slate-400">{d.entry.referrer ? `from ${hostOf(d.entry.referrer)}` : 'direct / link'}</span>
                </div>
              )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Total actions" value={d.total_events} />
              <Stat label="Sessions (visits)" value={d.sessions} />
              <Stat label="Time engaged" value={dur(d.engaged_seconds)} />
              <Stat label="Language (latest)" value={LANG[d.last_lang || ''] || (d.last_lang ? d.last_lang.toUpperCase() : '—')} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Interested in" sub="by activity — views · contacts · posts">
                {d.top_categories.length === 0 ? <Empty /> : (
                  <ul className="text-sm divide-y divide-slate-100">
                    {d.top_categories.map((c) => (
                      <li key={c.label} className="flex justify-between gap-2 py-1.5">
                        <span className="text-slate-700">{c.label}</span>
                        <span className="text-slate-400 whitespace-nowrap">{c.points} pts</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Contact actions" sub="call / whatsapp / share">
                {d.actions.length === 0 ? <Empty /> : (
                  <ul className="text-sm divide-y divide-slate-100">
                    {d.actions.map((a, i) => (
                      <li key={i} className="flex justify-between gap-2 py-1.5">
                        <span className="text-slate-700">
                          {TARGET[a.target || ''] || a.target || 'Action'}
                          {a.title && <> on {a.listing_id ? <Link to={`/admin/listings/${a.listing_id}`} className="text-brand hover:underline">{a.title}</Link> : a.title}</>}
                        </span>
                        <span className="text-slate-400 whitespace-nowrap text-xs">{fmt(a.ts)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Searches" sub="what they looked for">
                {d.searches.length === 0 ? <Empty /> : (
                  <ul className="text-sm divide-y divide-slate-100">
                    {d.searches.map((s) => (
                      <li key={s.query} className="flex justify-between py-1.5">
                        <span className="text-slate-700">{s.query} {s.zero && <span className="text-[11px] text-rose-500">(no results)</span>}</span>
                        <span className="text-slate-400">{s.count}×</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Devices & breakdown">
                <ul className="text-sm divide-y divide-slate-100">
                  {d.devices.map((x) => (
                    <li key={x.key} className="flex justify-between py-1.5"><span className="text-slate-700 capitalize">{x.key}</span><span className="text-slate-400">{x.count}</span></li>
                  ))}
                  {Object.entries(d.counts).map(([k, v]) => (
                    <li key={k} className="flex justify-between py-1.5"><span className="text-slate-500">{TYPE[k] || k}</span><span className="text-slate-400">{v}</span></li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Full timeline */}
            <Card title="Activity timeline" sub="most recent first">
              {d.timeline.length === 0 ? <Empty /> : (
                <ol className="text-sm space-y-1.5 mt-1">
                  {d.timeline.map((e, i) => (
                    <li key={i} className="flex items-start gap-3 py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-400 text-xs whitespace-nowrap w-32 shrink-0">{fmt(e.ts)}</span>
                      <span className="text-slate-700">
                        {TYPE[e.type] || e.type}
                        {e.type === 'contact_click' && e.target && <> · {TARGET[e.target] || e.target}</>}
                        {e.query && <> · “{e.query}”{e.result_count != null && <span className="text-slate-400"> ({e.result_count} results)</span>}</>}
                        {e.title && <> · {e.listing_id ? <Link to={`/admin/listings/${e.listing_id}`} className="text-brand hover:underline">{e.title}</Link> : e.title}</>}
                        {!e.title && e.path && (e.type === 'page_view') && <span className="text-slate-400 font-mono"> {e.path}</span>}
                        {e.lang && <span className="text-[11px] text-slate-400 uppercase"> · {e.lang}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
function Empty() { return <div className="text-sm text-slate-400">None yet.</div>; }
