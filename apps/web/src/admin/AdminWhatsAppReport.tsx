import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  whatsappReport, whatsappThread, type WaReport, type WaConversation, type WaMessage,
} from '../lib/whatsapp';

// Admin WhatsApp message report: stat tiles + a number-wise conversation list;
// pick a number to see its chat chronology (bubbles) and a message log where
// outbound rows and inbound replies are tinted differently.
const EVENT_LABEL: Record<string, string> = {
  post_approved: 'Post approved', contact_alert: 'Contact alert', reply: 'Reply',
};

function fmt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const t = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === now.toDateString()) return t;
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${t}`;
}
function statusText(m: WaMessage): string {
  if (m.direction === 'in') return '';
  if (m.status === 'read') return `Read ${fmt(m.read_at)}`;
  if (m.status === 'delivered') return `Delivered ${fmt(m.delivered_at)}`;
  if (m.status === 'failed') return `Failed${m.error ? ` · ${m.error}` : ''}`;
  return 'Sent';
}
const prettyNum = (n: string) => (n?.length === 12 && n.startsWith('91') ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : n);

export function AdminWhatsAppReport() {
  const [rep, setRep] = useState<WaReport | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState<string>('');           // selected number
  const [thread, setThread] = useState<WaMessage[] | null>(null);

  function load() {
    whatsappReport(q, type).then(setRep).catch((e) => setErr(e?.message || 'Failed to load'));
  }
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [q, type]);

  // Auto-select the first conversation once loaded.
  useEffect(() => {
    if (rep && !sel && rep.conversations[0]) setSel(rep.conversations[0]._id);
  }, [rep]);
  useEffect(() => {
    if (!sel) { setThread(null); return; }
    setThread(null);
    whatsappThread(sel).then((r) => setThread(r.results)).catch(() => setThread([]));
  }, [sel]);

  const s = rep?.stats;
  const tiles: [string, number, string][] = [
    ['Sent', s?.sent ?? 0, 'text-slate-800'],
    ['Delivered', s?.delivered ?? 0, 'text-slate-800'],
    ['Read', s?.read ?? 0, 'text-brand'],
    ['Failed', s?.failed ?? 0, 'text-rose-600'],
    ['Replies', s?.replies ?? 0, 'text-emerald-600'],
  ];
  const selConv = rep?.conversations.find((c) => c._id === sel);

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-3">WhatsApp messages</h1>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or name"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56" />
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">All types</option>
            <option value="post_approved">Post approved</option>
            <option value="contact_alert">Contact alert</option>
            <option value="reply">Replies</option>
          </select>
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {tiles.map(([label, val, cls]) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-3 py-2">
              <div className="text-xs text-slate-500">{label}</div>
              <div className={`text-xl font-semibold ${cls}`}>{val}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          {/* conversation list */}
          <div className="md:w-64 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500 flex justify-between">
              <span>Numbers</span><span>{rep?.conversations.length ?? 0}</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {rep?.conversations.map((c: WaConversation) => (
                <button key={c._id} onClick={() => setSel(c._id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 flex gap-2 ${sel === c._id ? 'bg-brand/10' : 'hover:bg-slate-50'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className={`text-[13px] font-medium truncate ${sel === c._id ? 'text-brand' : 'text-slate-800'}`}>{c.name || prettyNum(c._id)}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{fmt(c.last_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">{prettyNum(c._id)}</div>
                    <div className="text-[12px] text-slate-500 truncate">
                      {c.last_dir === 'in' ? '↩ ' : ''}{c.last_body || EVENT_LABEL[c.last_event] || ''}
                    </div>
                  </div>
                </button>
              ))}
              {rep && rep.conversations.length === 0 && (
                <div className="px-3 py-8 text-center text-slate-400 text-sm">No messages yet.</div>
              )}
            </div>
          </div>

          {/* chat + log */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-700">{selConv ? (selConv.name || prettyNum(selConv._id)) : 'Select a number'}</span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">chat chronology · oldest first</span>
              </div>
              <div className="p-3 space-y-2 max-h-[380px] overflow-y-auto">
                {!thread && sel && <div className="text-slate-400 text-sm text-center py-6">Loading…</div>}
                {thread?.map((m) => (
                  m.direction === 'out' ? (
                    <div key={m._id} className="max-w-[80%] ml-auto bg-sky-50 rounded-xl rounded-br-sm px-3 py-2">
                      <div className="text-[12.5px] text-sky-900 leading-relaxed whitespace-pre-wrap">{m.body}</div>
                      {m.buttons?.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 border-t border-sky-200 pt-1.5">
                          {m.buttons.map((b) => <span key={b} className="flex-1 text-center text-[11.5px] text-sky-800 border border-sky-200 rounded-md py-0.5">{b}</span>)}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-slate-500 text-right">{statusText(m)}</div>
                    </div>
                  ) : (
                    <div key={m._id} className="max-w-[80%] bg-emerald-50 rounded-xl rounded-bl-sm px-3 py-2">
                      <div className="text-[12.5px] text-emerald-900 whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-0.5 text-[11px] text-emerald-700">{fmt(m.createdAt)}{m.reply_choice ? ` · ${m.reply_choice === 'no' ? 'hide' : 'keep'}` : ''}</div>
                    </div>
                  )
                ))}
                {thread && thread.length === 0 && <div className="text-slate-400 text-sm text-center py-6">No messages.</div>}
              </div>
            </div>

            {/* message log — colored rows for in/out */}
            {thread && thread.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-slate-500">Message log · {selConv ? prettyNum(selConv._id) : ''}</span>
                  <span className="flex gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-100 inline-block" />Sent by us</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 inline-block" />Reply from user</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr><th className="px-3 py-1.5 font-medium w-16">Time</th><th className="px-2 py-1.5 font-medium">Message</th><th className="px-3 py-1.5 font-medium w-28">Status</th></tr>
                    </thead>
                    <tbody>
                      {thread.map((m) => (
                        <tr key={m._id} className={m.direction === 'out' ? 'bg-sky-50/70' : 'bg-emerald-50/70'}>
                          <td className={`px-3 py-1.5 align-top ${m.direction === 'out' ? 'text-sky-800' : 'text-emerald-800'}`}>{fmt(m.createdAt)}</td>
                          <td className={`px-2 py-1.5 ${m.direction === 'out' ? 'text-sky-900' : 'text-emerald-900'}`}>
                            <span className="text-slate-400 mr-1">{m.direction === 'out' ? '↗' : '↩'}</span>
                            {m.direction === 'in' ? `"${m.body}"` : <span title={m.body}>{EVENT_LABEL[m.event] || m.event} — {m.body.slice(0, 60)}{m.body.length > 60 ? '…' : ''}</span>}
                          </td>
                          <td className={`px-3 py-1.5 align-top ${m.direction === 'out' ? 'text-sky-800' : 'text-emerald-800'}`}>{m.direction === 'in' ? (m.reply_choice === 'no' ? 'Hidden' : m.reply_choice === 'yes' ? 'Kept' : 'Reply') : statusText(m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
