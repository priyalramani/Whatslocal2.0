import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getLoginGate } from '../lib/listings';
import { currentSession } from '../lib/userAuth';
import { OtpLogin } from './OtpLogin';
import { useT } from '../lib/i18n';

// Cumulative active time on the app (ms), persisted across sessions so the gate
// is a lifetime allowance, like the contact-reveal gate.
const TIME_KEY = 'wl_active_ms';

// Enforces the admin "Time spent" login limit client-side: once an anonymous
// visitor has spent > limit minutes on the app, a compulsory (non-dismissable)
// login is shown. Logged-in users and the admin app are exempt. The CONTACT
// limit is enforced server-side in reveal(); this covers the time dimension.
export function LoginGate() {
  const loc = useLocation();
  const { t } = useT();
  const [limitMin, setLimitMin] = useState(0);
  const [gated, setGated] = useState(false);
  const accRef = useRef<number>(Number(localStorage.getItem(TIME_KEY) || 0));

  const isAdmin = loc.pathname.startsWith('/admin');

  // Fetch the threshold once.
  useEffect(() => { getLoginGate().then((g) => setLimitMin(g.time_limit_minutes || 0)).catch(() => {}); }, []);

  useEffect(() => {
    if (isAdmin || !limitMin) return;          // admin app or gate off
    const limitMs = limitMin * 60_000;
    const check = () => { if (!currentSession() && accRef.current >= limitMs) setGated(true); };
    check();                                   // already over the limit from before?
    const id = setInterval(() => {
      if (currentSession()) return;            // logged in → no gate, stop counting
      if (document.visibilityState !== 'visible') return; // only count active time
      accRef.current += 1000;
      localStorage.setItem(TIME_KEY, String(accRef.current));
      check();
    }, 1000);
    return () => clearInterval(id);
  }, [limitMin, isAdmin]);

  if (!gated || isAdmin || currentSession()) return null;
  // Compulsory login — a popup with no close (OtpLogin renders its own dimmed
  // backdrop); only a successful login dismisses it.
  return <OtpLogin title={t('gate.timeTitle')} onSuccess={() => setGated(false)} />;
}
