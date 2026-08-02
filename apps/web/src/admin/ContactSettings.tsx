import { useEffect, useState } from 'react';
import { getContact, adminSetContact } from '../lib/profile';

// Contact-us settings POPUP (Settings → Contact Us). Sets the WhatsApp number +
// pre-typed message that the user profile screen's "Contact us" button opens.
export function ContactSettings({ onClose }: { onClose: () => void }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getContact()
      .then((c) => { setWhatsapp(c.whatsapp); setMessage(c.message); setLoaded(true); })
      .catch((e) => setErr(e?.message || 'Failed to load'));
  }, []);

  async function save() {
    setErr(''); setSaved(false); setSaving(true);
    try {
      const c = await adminSetContact(whatsapp, message);
      setWhatsapp(c.whatsapp); setMessage(c.message);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setErr(e?.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-slate-800">Contact us (WhatsApp)</div>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center">✕</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          The profile screen's <b>Contact us</b> button opens WhatsApp to this number with the message pre-typed.
          A bare 10-digit number is treated as Indian (+91); include the country code for others.
        </p>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}
        {!loaded && !err && <div className="text-slate-500">Loading…</div>}

        {loaded && (
          <>
            <label className="block mb-3">
              <span className="text-sm text-slate-700">WhatsApp number</span>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 15))}
                inputMode="numeric" placeholder="e.g. 9403061071" className={field} />
            </label>
            <label className="block mb-4">
              <span className="text-sm text-slate-700">Pre-typed message</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 400))} rows={3}
                placeholder="Hi WhatsLocal team, I need help with…" className={`${field} resize-y`} />
              <span className="text-[11px] text-slate-400">{message.length}/400</span>
            </label>
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="rounded-lg bg-brand text-white font-medium px-5 py-2 text-sm hover:bg-brand-dark disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
