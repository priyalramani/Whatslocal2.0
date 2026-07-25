import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import { currentSession, getMyProfile, setMyName } from '../../lib/userAuth';
import { OtpLogin } from '../OtpLogin';

// Gate any posting action (new complaint / comment) behind: (1) OTP login, then
// (2) a one-time display-name capture. If the account already has a name we
// resolve instantly — the name is asked ONCE and reused everywhere, so a user
// can't post under different names each time. Calls onReady() when good to go.
export function NameLoginGate({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<'login' | 'checking' | 'name'>(currentSession() ? 'checking' : 'login');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Logged in → does the account already have a name? If yes, we're done.
  async function checkName() {
    setStep('checking'); setErr('');
    try {
      const p = await getMyProfile();
      if (p.name && p.name.trim()) { onReady(); return; }
      setStep('name');
    } catch (e: any) {
      if (e?.status === 401) setStep('login'); else { setErr(e?.message || 'Failed'); setStep('name'); }
    }
  }
  useEffect(() => { if (currentSession()) checkName(); /* else wait for login */ /* eslint-disable-next-line */ }, []);

  async function save() {
    const n = name.trim();
    if (n.length < 2) { setErr(t('cmp.err.name')); return; }
    setBusy(true); setErr('');
    try { await setMyName(n); onReady(); }
    catch (e: any) { if (e?.status === 401) setStep('login'); else setErr(e?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  if (step === 'login') return <OtpLogin title={t('cmp.loginToPost')} onSuccess={checkName} onClose={onClose} />;

  if (step === 'checking') {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded-xl px-6 py-4 text-sm text-slate-500">{t('common.loading')}</div>
      </div>
    );
  }

  // step === 'name' — one-time capture
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold text-slate-800">{t('cmp.askNameTitle')}</div>
        <div className="text-sm text-slate-500 mt-1">{t('cmp.askNameBody')}</div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cmp.namePh')}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm mt-4 outline-none focus:border-brand" />
        {err && <div className="text-red-600 text-xs mt-2">{err}</div>}
        <button onClick={save} disabled={busy} className="w-full rounded-lg bg-brand text-white font-medium py-2.5 mt-4 disabled:opacity-60">
          {busy ? '…' : t('cmp.saveContinue')}
        </button>
      </div>
    </div>
  );
}
