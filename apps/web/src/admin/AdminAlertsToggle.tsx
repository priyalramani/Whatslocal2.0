import { useEffect, useState } from 'react';
import { adminPushOn, subscribeAdminPush, unsubscribeAdminPush, sendAdminTestPush, pushSupported } from '../lib/push';

// Sidebar toggle: turn on/off "new post for approval" push alerts for THIS
// device. Per-device (each admin phone enables its own); server only accepts it
// from a live admin session, and logout drops it. Hidden where push isn't
// supported (e.g. an iOS Safari tab that isn't installed).
export function AdminAlertsToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [supported, setSupported] = useState(true);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => { setSupported(pushSupported()); setOn(adminPushOn()); }, []);
  if (!supported) return null;

  async function toggle() {
    setBusy(true); setMsg(null);
    try {
      if (on) { await unsubscribeAdminPush(); setOn(false); }
      else {
        const ok = await subscribeAdminPush();
        setOn(ok);
        if (!ok) setMsg({ text: 'Allow notifications to enable', err: true });
      }
    } finally { setBusy(false); }
  }

  async function test() {
    setTesting(true); setMsg(null);
    try {
      const n = await sendAdminTestPush();
      setMsg(n > 0
        ? { text: `Sent to ${n} device${n > 1 ? 's' : ''} — check your notifications` }
        : { text: 'No device registered here yet', err: true });
    } finally { setTesting(false); setTimeout(() => setMsg(null), 6000); }
  }

  return (
    <div>
      <button type="button" onClick={toggle} disabled={busy}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm disabled:opacity-60 ${on ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`}>
        <span className="flex items-center gap-1.5">🔔 New-post alerts</span>
        <span className={`text-xs font-medium ${on ? 'text-emerald-600' : 'text-slate-400'}`}>{busy ? '…' : on ? 'On' : 'Off'}</span>
      </button>
      {on && (
        <button type="button" onClick={test} disabled={testing}
          className="w-full text-left px-3 py-1.5 rounded-lg text-[13px] text-slate-500 hover:bg-slate-100 disabled:opacity-60">
          {testing ? 'Sending…' : 'Send test notification'}
        </button>
      )}
      {msg && <div className={`text-[11px] px-3 mt-0.5 ${msg.err ? 'text-rose-500' : 'text-emerald-600'}`}>{msg.text}</div>}
    </div>
  );
}
