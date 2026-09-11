import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { popupAnalytics, type PopupStats } from '../lib/listings';

// Admin reference page (Settings → Pop-ups): documents every popup / gate the
// user app can show, when it triggers, a sample preview, and its analytics
// (shown / accepted / dismissed), on selecting a popup.

// A little phone-ish frame that dims the screen and drops the popup facsimile
// where the real one appears (center for modals, bottom for sheets/cards).
function Frame({ pos = 'center', dim = true, children }: { pos?: 'center' | 'bottom'; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className={`relative w-full h-40 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex ${pos === 'bottom' ? 'items-end' : 'items-center'} justify-center ${dim ? '' : ''}`}>
      {/* faint page behind */}
      <div className="absolute inset-0 p-2 space-y-1 opacity-40">
        <div className="h-3 w-2/3 rounded bg-slate-200" />
        <div className="h-12 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
      {dim && <div className="absolute inset-0 bg-black/30" />}
      <div className={`relative z-10 w-[86%] ${pos === 'bottom' ? 'mb-2' : ''}`}>{children}</div>
    </div>
  );
}
const card = 'bg-white rounded-lg shadow-lg border border-slate-200 p-2.5';
const btn = 'text-[10px] rounded-md px-2 py-1 font-medium';

function Sample({ id }: { id: string }) {
  switch (id) {
    case 'language':
      return (
        <Frame>
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800 text-center mb-1.5">Choose language / भाषा</div>
            <div className="flex gap-1.5">
              <div className={`${btn} bg-brand text-white flex-1 text-center`}>English</div>
              <div className={`${btn} bg-slate-100 text-slate-700 flex-1 text-center`}>हिंदी</div>
            </div>
          </div>
        </Frame>
      );
    case 'pincode':
      return (
        <Frame>
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800 mb-1.5">Enter your pincode</div>
            <div className="flex gap-1 justify-center mb-1">
              {[4, 4, 1, 6, 0, 1].map((n, i) => <div key={i} className="w-4 h-5 rounded border border-slate-300 text-[10px] text-slate-700 flex items-center justify-center">{n}</div>)}
            </div>
            <div className="text-[9px] text-emerald-600 text-center">📍 Gondia, Maharashtra</div>
          </div>
        </Frame>
      );
    case 'gender':
      return (
        <Frame>
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800 text-center mb-1.5">You are…</div>
            <div className="flex gap-1.5">
              <div className={`${btn} bg-slate-100 text-slate-700 flex-1 text-center`}>♂ Male</div>
              <div className={`${btn} bg-slate-100 text-slate-700 flex-1 text-center`}>♀ Female</div>
              <div className={`${btn} bg-slate-100 text-slate-700 flex-1 text-center`}>⚧ Other</div>
            </div>
          </div>
        </Frame>
      );
    case 'login':
      return (
        <Frame>
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800 mb-1.5">Login to continue</div>
            <div className="h-5 rounded border border-slate-300 text-[9px] text-slate-400 flex items-center px-2 mb-1.5">10-digit mobile</div>
            <div className={`${btn} bg-brand text-white text-center`}>Send OTP</div>
          </div>
        </Frame>
      );
    case 'push':
      return (
        <Frame pos="bottom">
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800">Get WhatsLocal alerts?</div>
            <div className="text-[9px] text-slate-500 mb-1.5">New posts and replies in Gondia.</div>
            <div className="flex gap-1.5 justify-end">
              <div className={`${btn} text-slate-500`}>Not now</div>
              <div className={`${btn} bg-brand text-white`}>Allow</div>
            </div>
          </div>
        </Frame>
      );
    case 'install':
      return (
        <Frame pos="bottom">
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800">📲 Add WhatsLocal to your phone</div>
            <div className="text-[9px] text-slate-500 mb-1.5">Opens like an app — one tap, faster.</div>
            <div className="flex gap-1.5 justify-end">
              <div className={`${btn} text-slate-500`}>Not now</div>
              <div className={`${btn} bg-brand text-white`}>Install</div>
            </div>
          </div>
        </Frame>
      );
    case 'reverse':
      return (
        <Frame pos="bottom">
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800">Can't find it?</div>
            <div className="text-[9px] text-slate-500 mb-1.5">Post your requirement — sellers will reach you.</div>
            <div className={`${btn} bg-brand text-white inline-block`}>Post now</div>
          </div>
        </Frame>
      );
    case 'jobguard':
      return (
        <Frame pos="bottom">
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800">Calling about a job?</div>
            <div className="text-[9px] text-slate-500 mb-1.5">See job openings instead of this shop?</div>
            <div className="flex gap-1.5">
              <div className={`${btn} bg-brand text-white flex-1 text-center`}>Yes, show jobs</div>
              <div className={`${btn} bg-slate-100 text-slate-700 flex-1 text-center`}>No</div>
            </div>
          </div>
        </Frame>
      );
    case 'duplicate':
      return (
        <Frame>
          <div className={card}>
            <div className="text-[11px] font-semibold text-slate-800 mb-1">This number already has a post</div>
            <div className="text-[9px] text-slate-500 border border-slate-200 rounded px-1.5 py-1 mb-1.5">Sharma Kirana · Grocery</div>
            <div className="flex gap-1.5 justify-end">
              <div className={`${btn} text-slate-500`}>Continue anyway</div>
              <div className={`${btn} bg-brand text-white`}>Edit it</div>
            </div>
          </div>
        </Frame>
      );
    default:
      return <Frame><div className="text-[10px] text-slate-400 text-center">—</div></Frame>;
  }
}

interface Row { id: string; name: string; tag: string; tagCls: string; when: string; skip: string; }
const ROWS: Row[] = [
  {
    id: 'language', name: 'Language select', tag: 'Blocking', tagCls: 'bg-rose-100 text-rose-700',
    when: 'On the very first visit, before anything else, if the visitor hasn\'t chosen a language yet. It\'s the first-run blocker every other popup waits behind.',
    skip: 'No skip or close — closes only by picking English or हिंदी. Never shown again once chosen.',
  },
  {
    id: 'pincode', name: 'Pincode / City', tag: 'First visit', tagCls: 'bg-amber-100 text-amber-700',
    when: 'On a first visit with no known city (bare whatslocal.in link), right after language. Also any time the visitor taps the city chip to switch city.',
    skip: 'Dismissable (✕ or tap outside). Closing accepts the default city, so it is not forced again on later visits.',
  },
  {
    id: 'gender', name: 'Gender ask', tag: 'Compulsory', tagCls: 'bg-rose-100 text-rose-700',
    when: 'About 12 seconds after the app loads, if we don\'t yet know this visitor\'s gender. Works for logged-in and anonymous visitors. Never on admin pages.',
    skip: 'No skip — closes only after they pick Male / Female / Other. If they reload without answering, it asks again next time.',
  },
  {
    id: 'login', name: 'Login (OTP)', tag: 'Reused', tagCls: 'bg-slate-200 text-slate-700',
    when: 'One login popup reused wherever sign-in is needed: posting a listing, revealing a contact beyond the free anonymous limit, reporting a post, opening "My Posts" / Profile, editing your own post, posting a cab trip or a complaint. Also the "time-spent" gate: once an anonymous visitor has spent the admin-set amount of active time on the app.',
    skip: 'Usually dismissable (✕ / tap outside). Compulsory (login-only, no close) for the time-spent gate and for editing your own post.',
  },
  {
    id: 'push', name: 'Allow notifications', tag: 'Soft ask', tagCls: 'bg-sky-100 text-sky-700',
    when: 'A small bottom card shown after the visitor successfully posts, or after a search that returns nothing — but only if the browser hasn\'t been asked yet, they haven\'t subscribed, fewer than 3 past dismissals, and at least a day since the last ask.',
    skip: 'Dismissable ("Not now"). Re-asks on a later visit — at most 3 times total, at most once a day, never twice in one visit.',
  },
  {
    id: 'install', name: 'Install app (Add to Home Screen)', tag: 'Soft ask', tagCls: 'bg-sky-100 text-sky-700',
    when: 'For a RETURNING visitor (their 2nd session or later), the first time they tap a contact (call / WhatsApp / copy) that session — ~1.5s after, so the app has just proven useful. Only if no other soft-card (notifications / reverse-post nudge) already showed this session. On Android the "Install" button fires the browser\'s native prompt; on iPhone (Safari) it shows the manual "Share → Add to Home Screen" steps. Never on admin pages, never once already installed.',
    skip: 'Dismissable ("Not now" / "Got it") — soft, so it can re-ask later. At most 3 times ever, a 7-day gap between asks, once per session; stops for good once installed.',
  },
  {
    id: 'reverse', name: '"Reverse posting" nudge', tag: 'Soft ask', tagCls: 'bg-sky-100 text-sky-700',
    when: 'A slide-up card ~1.2 s after landing on a browse/home page, at most once per visit, if there\'s a reason: the visitor searched for a service and found nothing (in the last 30 min), or has viewed the same category 2+ times. It invites them to POST instead of only searching.',
    skip: 'Dismissable (✕). Won\'t reappear for 3 days if dismissed, 30 days if they tap it and go post.',
  },
  {
    id: 'jobguard', name: '"Calling for a job?" sheet', tag: 'Smart gate', tagCls: 'bg-violet-100 text-violet-700',
    when: 'When someone taps Contact on a shop (business) listing after they\'ve been browsing job posts (viewed 2+ job openings). It checks they\'re not a job-seeker about to call a shop by mistake — Yes routes them to job openings, No shows the contact.',
    skip: 'Dismissable (tap outside). Once they answer "No" it stops asking for the rest of that visit.',
  },
  {
    id: 'duplicate', name: 'Duplicate-post warning', tag: 'On action', tagCls: 'bg-slate-200 text-slate-700',
    when: 'While posting, when the contact number entered already has a post of the same type (checked as they finish typing the number). Offers to edit the existing post instead of creating a duplicate.',
    skip: 'Dismissable ("Continue anyway"), which won\'t warn again for that same number + type.',
  },
];

const pctOf = (n: number, shown: number) => (shown > 0 ? Math.round((n / shown) * 100) : 0);

export function AdminPopups() {
  const [stats, setStats] = useState<PopupStats | null>(null);
  const [err, setErr] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Two sections: Reports (all popups, default) + Details & conditions.
  const [tab, setTab] = useState<'reports' | 'details'>('reports');

  useEffect(() => {
    popupAnalytics(from || undefined, to || undefined).then(setStats).catch((e) => setErr(e?.message || 'Failed to load analytics'));
  }, [from, to]);

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-1">Pop-ups</h1>
        <p className="text-sm text-slate-500 mb-4 max-w-2xl">
          How every popup, prompt and gate performs — and, under Details, what makes each one appear and whether it can be skipped.
        </p>

        {/* Section tabs — Reports is the default landing view. */}
        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {([['reports', 'Reports'], ['details', 'Details & conditions']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-3.5 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'reports' ? (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="text-sm text-slate-500">Shown / accepted / dismissed per popup. “Ignored” = shown but neither.</div>
              <div className="flex items-center gap-1.5">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600" />
                <span className="text-slate-400 text-xs">→</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600" />
                {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs text-slate-400 hover:text-slate-600 px-1">clear</button>}
              </div>
            </div>
            {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-2">{err}</div>}
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pop-up</th>
                    <th className="px-3 py-2 font-medium text-right">Shown</th>
                    <th className="px-3 py-2 font-medium text-right">Accepted</th>
                    <th className="px-3 py-2 font-medium text-right">Dismissed</th>
                    <th className="px-3 py-2 font-medium text-right">Ignored</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ROWS.map((r) => {
                    const s = stats?.[r.id] || { shown: 0, accepted: 0, dismissed: 0 };
                    const ignored = Math.max(0, s.shown - s.accepted - s.dismissed);
                    const cell = (n: number, cls: string) => (
                      <td className={`px-3 py-2 text-right ${cls}`}>
                        {n.toLocaleString('en-IN')}{s.shown ? <span className="text-slate-400 text-xs"> · {pctOf(n, s.shown)}%</span> : null}
                      </td>
                    );
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-800">{r.name}</span>
                          <span className={`ml-2 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${r.tagCls}`}>{r.tag}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 font-medium">{s.shown.toLocaleString('en-IN')}</td>
                        {cell(s.accepted, 'text-emerald-600')}
                        {cell(s.dismissed, 'text-rose-600')}
                        {cell(ignored, 'text-slate-500')}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
              “Ignored” = shown but neither accepted nor dismissed (reloaded, tapped outside, or left). Counts are per event since tracking went live{from || to ? ', within the chosen dates' : ''}. Popups not yet instrumented read 0.
            </p>
          </>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[13px] rounded-lg px-3 py-2 mb-5">
              Note: the <b>Install app</b> popup is live — it nudges returning visitors to add WhatsLocal to their home
              screen. There is still no "update available", cookie banner, or rating prompt.
            </div>
            <div className="space-y-3">
              {ROWS.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col md:flex-row gap-4">
                  <div className="md:w-64 shrink-0"><Sample id={r.id} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${r.tagCls}`}>{r.tag}</span>
                    </div>
                    <div className="text-[13px] text-slate-600 leading-relaxed"><b className="text-slate-700">When it shows:</b> {r.when}</div>
                    <div className="text-[13px] text-slate-600 leading-relaxed mt-1"><b className="text-slate-700">Skip / repeat:</b> {r.skip}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
