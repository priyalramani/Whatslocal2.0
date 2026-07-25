import { useEffect, useState } from 'react';
import { getLoginGate, adminSetLoginGate } from '../lib/listings';

// Login-gate settings as a POPUP (Settings → Login Limits). Same fields as the
// old Settings page; when a visitor hits either limit they must register.
export function LoginLimits({ onClose }: { onClose: () => void }) {
  const [time, setTime] = useState('');
  const [contact, setContact] = useState('');
  const [daily, setDaily] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getLoginGate()
      .then((g) => { setTime(String(g.time_limit_minutes)); setContact(String(g.contact_limit)); setDaily(String(g.daily_contact_limit)); setLoaded(true); })
      .catch((e) => setErr(e?.message || 'Failed to load'));
  }, []);

  async function save() {
    setErr(''); setSaved(false); setSaving(true);
    try {
      const g = await adminSetLoginGate({
        time_limit_minutes: Math.max(0, Math.floor(Number(time) || 0)),
        contact_limit: Math.max(0, Math.floor(Number(contact) || 0)),
        daily_contact_limit: Math.max(0, Math.floor(Number(daily) || 0)),
      });
      setTime(String(g.time_limit_minutes)); setContact(String(g.contact_limit)); setDaily(String(g.daily_contact_limit));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setErr(e?.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  const input = 'w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-slate-800">Login limits</div>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center">✕</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">A visitor (not logged in) who reaches the time or free-contacts limit must register (free). The daily limit caps contacts per day for everyone (resets 12am IST). Set <b>0</b> to turn a limit off.</p>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}
        {!loaded && !err && <div className="text-slate-500">Loading…</div>}

        {loaded && (
          <>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">Time spent<span className="block text-xs text-slate-400">Minutes browsing before login.</span></span>
                <span className="flex items-center gap-2"><input type="number" min={0} value={time} onChange={(e) => setTime(e.target.value)} className={input} /><span className="text-sm text-slate-500">min</span></span>
              </label>
              <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-700">Free contacts<span className="block text-xs text-slate-400">Numbers a new visitor can open before login.</span></span>
                <span className="flex items-center gap-2"><input type="number" min={0} value={contact} onChange={(e) => setContact(e.target.value)} className={input} /><span className="text-sm text-slate-500">contacts</span></span>
              </label>
              <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-700">Daily limit<span className="block text-xs text-slate-400">Max contacts per day (resets 12am IST).</span></span>
                <span className="flex items-center gap-2"><input type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} className={input} /><span className="text-sm text-slate-500">/ day</span></span>
              </label>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button onClick={save} disabled={saving} className="rounded-lg bg-brand text-white font-medium px-5 py-2 text-sm hover:bg-brand-dark disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
