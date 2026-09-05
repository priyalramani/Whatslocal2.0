import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminTestWhatsapp } from '../lib/whatsapp';

// WhatsApp test sender (Settings → WhatsApp Test). Enter the placeholders and
// shoot ONE real template message to any number, to prove the WABA wiring before
// an auto-trigger is attached. First template: post_approved_hindi —
//   body:  "आपकी पोस्ट *{{1}}* अप्रूव हो गई है और अब *{{2}}* में पब्लिश हो गई है।"
//   button: a dynamic URL (View Post) = {{url}}
export function AdminWhatsApp() {
  const [to, setTo] = useState('');
  const [template, setTemplate] = useState('post_approved_hindi');
  const [v1, setV1] = useState('');   // {{1}} — post title
  const [v2, setV2] = useState('');   // {{2}} — where it's published (category/city)
  const [url, setUrl] = useState(''); // {{url}} — View-Post link
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  async function send() {
    setErr(''); setOk(''); setSending(true);
    try {
      const r = await adminTestWhatsapp({
        to: to.trim(),
        template: template.trim() || 'post_approved_hindi',
        bodyParams: [v1, v2],
        buttonUrl: url.trim() || undefined,
      });
      setOk(`Sent to ${r.to}${r.providerMessageId ? ` · id ${r.providerMessageId}` : ''}`);
    } catch (e: any) {
      setErr(e?.message || 'Send failed');
    } finally { setSending(false); }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';
  // Live preview of the Hindi body so the admin sees the message before sending.
  const preview = `आपकी पोस्ट *${v1 || '{{1}}'}* अप्रूव हो गई है और अब *${v2 || '{{2}}'}* में पब्लिश हो गई है।\n\nदेखने के लिए View Post पर टैप करें।`;

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-1">WhatsApp Test</h1>
        <p className="text-sm text-slate-500 mb-5">
          Enter the placeholders and send one real message via WABA. Use it to confirm the number
          receives the template before we auto-send it on an event.
        </p>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">{err}</div>}
        {ok && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2 mb-4">✓ {ok}</div>}

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <label className="block">
            <span className="text-sm text-slate-700">Recipient mobile</span>
            <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(0, 15))}
              inputMode="numeric" placeholder="10-digit — e.g. 9403061071" className={field} />
            <span className="text-[11px] text-slate-400">Bare 10 digits = Indian (+91 added automatically).</span>
          </label>

          <label className="block">
            <span className="text-sm text-slate-700">Template name</span>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} className={field} />
            <span className="text-[11px] text-slate-400">Must be an approved WABA template. Default: post_approved_hindi.</span>
          </label>

          <div className="border-t border-slate-100 pt-4">
            <div className="text-[12px] font-medium text-slate-500 mb-2">Placeholders</div>
            <label className="block mb-3">
              <span className="text-sm text-slate-700">{'{{1}}'} — Post title</span>
              <input value={v1} onChange={(e) => setV1(e.target.value)} placeholder="e.g. Ganesh Furniture Works" className={field} />
            </label>
            <label className="block mb-3">
              <span className="text-sm text-slate-700">{'{{2}}'} — Published in</span>
              <input value={v2} onChange={(e) => setV2(e.target.value)} placeholder="e.g. Home Repair · Gondia" className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">{'{{url}}'} — View-Post link</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://whatslocal.in/gondia/…" className={field} />
            </label>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="text-[12px] font-medium text-slate-500 mb-1">Preview</div>
            <div className="rounded-lg bg-[#e7ffdb] text-slate-800 text-sm px-3 py-2 whitespace-pre-wrap leading-relaxed">{preview}</div>
          </div>

          <button onClick={send} disabled={sending || !to.trim()}
            className="rounded-lg bg-brand text-white font-medium px-5 py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50">
            {sending ? 'Sending…' : 'Send test message'}
          </button>
        </div>
      </main>
    </div>
  );
}
