import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { currentSession } from '../lib/userAuth';
import { useT } from '../lib/i18n';
import { OtpLogin } from './OtpLogin';

const TABS = [
  { to: '/', key: 'nav.home', icon: '🏠' },
  { to: '/my', key: 'nav.myPosts', icon: '👤', auth: true, userOnly: true },
  { to: '/post', key: 'nav.post', icon: '➕', userOnly: true },
];

// Fixed bottom bar, centered to the phone-width column.
// `preview` (admin User View): show the exact same bar but disable the actions
// that don't apply to an admin (My Posts / Post) — greyed and non-clickable.
export function BottomNav({ preview = false }: { preview?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useT();
  const [loginOpen, setLoginOpen] = useState(false);

  const cls = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-brand' : 'text-slate-400'}`;

  return (
    <>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-slate-200 flex z-20">
        {TABS.map((tab) => {
          const active = tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to);
          const label = t(tab.key);
          // Admin preview: render the disabled tab so the bar looks identical
          // to the user's, but it does nothing.
          if (preview && tab.userOnly) {
            return (
              <span key={tab.to} aria-disabled className={`${cls(false)} opacity-40 cursor-not-allowed`}>
                <span className="text-lg leading-none">{tab.icon}</span>
                {label}
              </span>
            );
          }
          // Auth-gated tabs (My Posts): if logged out, open the login popup
          // over the CURRENT page instead of navigating to a login screen.
          if (tab.auth && !currentSession()) {
            return (
              <button key={tab.to} onClick={() => setLoginOpen(true)} className={cls(active)}>
                <span className="text-lg leading-none">{tab.icon}</span>
                {label}
              </button>
            );
          }
          return (
            <Link key={tab.to} to={tab.to} className={cls(active)}>
              <span className="text-lg leading-none">{tab.icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {loginOpen && (
        <OtpLogin title={t('login.seePosts')}
          onSuccess={() => { setLoginOpen(false); navigate('/my'); }}
          onClose={() => setLoginOpen(false)} />
      )}
    </>
  );
}
