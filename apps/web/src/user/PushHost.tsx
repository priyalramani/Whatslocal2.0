import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { _setPushShow, subscribePush, noteAsked, noteDismissed } from '../lib/push';

// Global host for the notification soft-ask card. Stays invisible until a page
// calls maybeAskPush('post'|'search'). "Yes, notify me" fires the real browser
// prompt (in this tap); "Not now" dismisses softly (re-askable later).
export function PushHost() {
  const { t } = useT();
  const [reason, setReason] = useState<'post' | 'search' | null>(null);

  useEffect(() => {
    _setPushShow((r) => {
      noteAsked();
      // Drop focus so the mobile keyboard closes — otherwise this bottom card
      // hides behind it (it fires right after a search, keyboard still open).
      (document.activeElement as HTMLElement | null)?.blur?.();
      setReason(r);
    });
    return () => _setPushShow(null);
  }, []);

  if (!reason) return null;
  const title = reason === 'search' ? t('push.search.title') : t('push.post.title');
  const body = reason === 'search' ? t('push.search.body') : t('push.post.body');

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-4 pointer-events-none">
      <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 pointer-events-auto">
        <div className="text-base font-semibold text-slate-800">🔔 {title}</div>
        <p className="text-sm text-slate-500 mt-1">{body}</p>
        <p className="text-[11px] text-slate-400 mt-1.5">{t('push.helper')}</p>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => { noteDismissed(); setReason(null); }}
            className="flex-1 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium py-2.5 hover:bg-slate-50">
            {t('push.later')}
          </button>
          <button type="button" onClick={() => { setReason(null); void subscribePush(); }}
            className="flex-1 rounded-lg bg-brand text-white text-sm font-medium py-2.5 hover:bg-brand-dark">
            {t('push.yes')}
          </button>
        </div>
      </div>
    </div>
  );
}
