import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { _setInstallShow, promptInstall, noteAsked, noteDismissed, isIosInstall } from '../lib/install';
import { claimSoftAsk } from '../lib/softAsk';
import { trackPopup } from '../lib/analytics';

// Global host for the "Install app / Add to home screen" soft-ask card. Invisible
// until a trigger calls maybeAskInstall(...). Mirrors PushHost: "Install" fires
// the native prompt in THIS tap (Android); on iOS Safari it instead shows the
// manual Share → Add to Home Screen steps (no programmatic install exists there).
export function InstallHost() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    _setInstallShow(() => {
      noteAsked();
      claimSoftAsk();   // take the one-soft-card-per-session slot
      (document.activeElement as HTMLElement | null)?.blur?.();
      setIos(isIosInstall());
      setOpen(true);
      trackPopup('install', 'shown');
    });
    return () => _setInstallShow(null);
  }, []);

  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-4 pointer-events-none">
      <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 pointer-events-auto">
        <div className="text-base font-semibold text-slate-800">📲 {t('install.title')}</div>
        <p className="text-sm text-slate-500 mt-1">{t('install.body')}</p>

        {ios ? (
          <>
            {/* iOS Safari: no native prompt — tell them the two taps. */}
            <ol className="text-[13px] text-slate-600 mt-2 space-y-1 list-decimal pl-5">
              <li>{t('install.ios.step1')}</li>
              <li>{t('install.ios.step2')}</li>
            </ol>
            <div className="flex justify-end mt-3">
              <button type="button" onClick={() => { noteDismissed(); close(); }}
                className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2.5 hover:bg-brand-dark">
                {t('install.gotit')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => { noteDismissed(); close(); }}
              className="flex-1 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium py-2.5 hover:bg-slate-50">
              {t('install.later')}
            </button>
            <button type="button" onClick={async () => { close(); await promptInstall(); }}
              className="flex-1 rounded-lg bg-brand text-white text-sm font-medium py-2.5 hover:bg-brand-dark">
              {t('install.yes')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
