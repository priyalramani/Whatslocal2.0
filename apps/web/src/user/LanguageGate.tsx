import { useState } from 'react';
import { useT, getStoredLang, type Lang } from '../lib/i18n';

// Shown once on first visit (no language stored yet). Tapping a language APPLIES
// it immediately — no second "Continue" tap. Changeable later from the header.
export function LanguageGate() {
  const { setLang, t } = useT();
  const [open, setOpen] = useState(getStoredLang() === null);
  if (!open) return null;

  const pick = (v: Lang) => { setLang(v); setOpen(false); };

  const Option = ({ value, label, sub }: { value: Lang; label: string; sub: string }) => (
    <button type="button" onClick={() => pick(value)}
      className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3.5 text-left transition hover:border-brand active:scale-[.99]">
      <div className="text-lg font-semibold text-slate-900">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-5">
      <div className="w-full max-w-[380px] rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center mb-5">
          <img src="/logo.svg" alt="WhatsLocal" className="h-16 mx-auto" />
          <div className="text-lg font-bold text-slate-900 mt-3">{t('lang.title')}</div>
          <div className="text-sm text-slate-500 mt-1">{t('lang.subtitle')}</div>
        </div>
        <div className="space-y-2.5">
          <Option value="en" label="English" sub="Continue in English" />
          <Option value="hi" label="हिंदी" sub="हिंदी में आगे बढ़ें" />
        </div>
      </div>
    </div>
  );
}
