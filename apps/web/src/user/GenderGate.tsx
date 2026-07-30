import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT, getStoredLang } from '../lib/i18n';
import { getGender, saveGender } from '../lib/profile';

// Compulsory one-time gender prompt. ~12s after the app loads it appears for
// anyone whose gender we don't know — logged in OR anonymous (it saves against
// the device id, and links to the account on login). No skip and no dismiss: it
// closes only once answered. If the visitor reloads without answering, the check
// runs again next load and it reappears, so it's effectively unskippable.
const OPTIONS: { v: string; sym: string; key: string }[] = [
  { v: 'male', sym: '♂', key: 'gender.male' },
  { v: 'female', sym: '♀', key: 'gender.female' },
  { v: 'other', sym: '⚧', key: 'gender.other' },
];

export function GenderGate() {
  const { t } = useT();
  const loc = useLocation();
  const [show, setShow] = useState(false);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);   // stop once the gender is known or the prompt is up

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      if (!alive || settled.current) return;
      // Don't stack on the first-run language gate — wait until a language exists.
      if (!getStoredLang()) { timer = setTimeout(attempt, 4000); return; }
      try {
        const r = await getGender();
        if (!alive) return;
        if (r.gender) { settled.current = true; return; }   // already known → never ask
        settled.current = true;
        setShow(true);
      } catch {
        timer = setTimeout(attempt, 8000);   // network hiccup → retry
      }
    };
    timer = setTimeout(attempt, 12000);
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  async function save() {
    if (!choice || busy) return;
    setBusy(true);
    try { await saveGender(choice); setShow(false); }
    catch { /* keep it open so they can retry */ }
    finally { setBusy(false); }
  }

  // Never over the admin app (admins aren't the audience). The /website tree is
  // a separate branch that never mounts this at all.
  if (!show || loc.pathname.startsWith('/admin')) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-5">
      <div className="w-full max-w-[320px] rounded-[20px] bg-white px-[22px] pt-6 pb-6">
        <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-brand/10 flex items-center justify-center text-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
        </div>
        <div className="text-center text-[17px] font-semibold text-slate-900 mb-4">{t('gender.title')}</div>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => {
            const on = choice === o.v;
            return (
              <button key={o.v} onClick={() => setChoice(o.v)}
                className={`rounded-2xl border-[1.5px] py-3.5 flex flex-col items-center gap-1.5 transition ${on ? 'border-brand bg-brand/10' : 'border-slate-200 bg-white'}`}>
                <span className={`text-2xl leading-none ${on ? 'text-brand' : 'text-slate-500'}`}>{o.sym}</span>
                <span className={`text-[12.5px] ${on ? 'text-brand font-medium' : 'text-slate-800'}`}>{t(o.key)}</span>
              </button>
            );
          })}
        </div>
        <button onClick={save} disabled={!choice || busy}
          className="mt-5 w-full h-[46px] rounded-2xl bg-brand text-white text-[14.5px] font-medium disabled:bg-slate-300 disabled:cursor-not-allowed">
          {busy ? '…' : t('gender.save')}
        </button>
      </div>
    </div>
  );
}
