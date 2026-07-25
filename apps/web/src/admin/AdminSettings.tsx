import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLoginGate, adminSetLoginGate } from '../lib/listings';

export function AdminSettings() {
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
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setErr(e?.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  const input = 'w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-1">Settings</h1>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 my-3">{err}</div>}
        {!loaded && !err && <div className="text-slate-500 mt-4">Loading…</div>}

        {loaded && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
            <div className="font-semibold text-slate-800">Ask-for-login limits</div>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              When a visitor (not logged in) reaches <b>either</b> limit, they're asked to register (free) to continue.
              Set a value to <b>0</b> to turn that limit off.
            </p>

            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">
                  Time spent
                  <span className="block text-xs text-slate-400">Total minutes browsing before login is required.</span>
                </span>
                <span className="flex items-center gap-2">
                  <input type="number" min={0} value={time} onChange={(e) => setTime(e.target.value)} className={input} />
                  <span className="text-sm text-slate-500">minutes</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-700">
                  Free contacts
                  <span className="block text-xs text-slate-400">Numbers a new visitor can open before login is required.</span>
                </span>
                <span className="flex items-center gap-2">
                  <input type="number" min={0} value={contact} onChange={(e) => setContact(e.target.value)} className={input} />
                  <span className="text-sm text-slate-500">contacts</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-700">
                  Daily limit
                  <span className="block text-xs text-slate-400">Max contacts anyone can open per day. Resets at 12am IST.</span>
                </span>
                <span className="flex items-center gap-2">
                  <input type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} className={input} />
                  <span className="text-sm text-slate-500">/ day</span>
                </span>
              </label>
            </div>

            <div className="text-xs text-slate-400 mt-4">
              e.g. Free contacts = 3 → after opening 3 numbers, the 4th prompts login. Daily = 5 → nobody can open more than 5 per day. 0 turns a limit off.
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button onClick={save} disabled={saving}
                className="rounded-lg bg-brand text-white font-medium px-5 py-2 text-sm hover:bg-brand-dark disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
