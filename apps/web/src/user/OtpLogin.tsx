import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../lib/brand';
import { requestOtp, loginWithOtp } from '../lib/userAuth';
import { msg91Configured } from '../lib/msg91';
import { useT } from '../lib/i18n';

// Mobile + OTP login for general users. (OTP is 1234 for now.)
// ALWAYS a popup (dimmed modal) — never a full-screen page. With `onClose` it's
// dismissable (X + tap-outside); without it, it's a COMPULSORY popup (no close)
// that only a successful login dismisses.
export function OtpLogin({ onSuccess, title, onClose }: {
  onSuccess: () => void;
  title?: string;
  onClose?: () => void;
}) {
  const { t } = useT();
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Land straight in the number field with the number pad up — autoFocus alone
  // often doesn't raise the keyboard on mobile.
  const mobRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => mobRef.current?.focus(), 80); return () => clearTimeout(t); }, []);

  async function send() {
    setErr('');
    setBusy(true);
    try { await requestOtp(mobile); setSent(true); }
    catch (e: any) { setErr(e?.message || t('login.couldNotSend')); }
    finally { setBusy(false); }
  }
  async function verify() {
    setErr(''); setBusy(true);
    try { await loginWithOtp(mobile, otp); onSuccess(); }
    catch (e: any) { setErr(e?.message || t('login.invalidOtp')); }
    finally { setBusy(false); }
  }

  const body = (
    <>
        <div className="text-center mb-5">
          <img src="/logo.svg" alt={BRAND.displayName} className="h-14 mx-auto" />
          {/* The REASON they're here is the headline — not fine print. */}
          <div className="text-[17px] font-semibold text-slate-900 leading-snug mt-3">{title || t('login.title')}</div>
        </div>

        <label className="block">
          <span className="text-sm text-slate-600">{t('login.mobile')}</span>
          <input ref={mobRef} value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} disabled={sent}
            placeholder={t('login.mobilePh')}
            type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px] tracking-wide outline-none focus:border-brand disabled:bg-slate-50" />
        </label>

        {sent && (
          <label className="block mt-4">
            <span className="text-sm text-slate-600">{t('login.enterOtp')}</span>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus inputMode="numeric"
              placeholder={t('login.otpPh')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand tracking-widest" />
            {!msg91Configured && <span className="text-[11px] text-slate-400">{t('login.demoOtp')}</span>}
          </label>
        )}

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mt-4">{err}</div>}

        <button onClick={sent ? verify : send} disabled={busy || (!sent && mobile.replace(/\D/g, '').length < 10)}
          className="mt-6 w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-50">
          {busy ? '…' : sent ? t('login.verify') : t('login.sendOtp')}
        </button>

        {sent && (
          <button onClick={() => { setSent(false); setOtp(''); }} className="mt-3 text-xs text-slate-400">
            {t('login.changeNumber')}
          </button>
        )}
    </>
  );

  // Always a popup. Dismissable (X + tap-outside) when `onClose` is given;
  // otherwise a compulsory popup — no close, only login gets past it.
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose ? onClose : undefined}>
      <div className="relative w-full max-w-[400px] rounded-2xl bg-white px-7 py-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button onClick={onClose} aria-label="Close"
            className="absolute top-3 right-3 h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center text-lg">✕</button>
        )}
        {body}
      </div>
    </div>
  );
}
