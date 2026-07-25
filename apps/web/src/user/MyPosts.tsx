import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { myListings, setMyListingActive } from '../lib/listings';
import { listingPath } from '../lib/city';
import { currentSession, userLogout } from '../lib/userAuth';
import { useT } from '../lib/i18n';
import { OtpLogin } from './OtpLogin';
import { BottomNav } from './BottomNav';
import { Home } from './Home';

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-rose-100 text-rose-600',
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">{children}</div>
    </div>
  );
}

export function MyPosts() {
  const { t } = useT();
  const [session, setSession] = useState(currentSession());
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function load() {
    try { setRows(await myListings()); } catch (e: any) { setErr(e?.message || 'Failed'); }
  }
  useEffect(() => { if (session) load(); }, [session]);

  // Not logged in: show the login as a dismissable popup over the live Home
  // screen, so there's real content behind the dim overlay (not a blank frame)
  // and the user can back out without being trapped on a full-screen login.
  if (!session) return (
    <>
      <Home />
      <OtpLogin title={t('login.seePosts')}
        onSuccess={() => setSession(currentSession())}
        onClose={() => navigate('/')} />
    </>
  );

  async function toggle(id: string, active: boolean) {
    await setMyListingActive(id, active);
    setRows((rs) => (rs ? rs.map((r) => (r._id === id ? { ...r, active } : r)) : rs));
  }

  return (
    <Frame>
      <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-white/70">{session.mobile}</div>
            <div className="text-lg font-semibold">{t('my.title')}</div>
          </div>
          <button onClick={() => { userLogout(); setSession(null); }} className="text-xs text-white/80 bg-white/15 rounded-full px-3 py-1.5">{t('common.logout')}</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}
        {!rows && <div className="text-slate-400 text-sm">{t('common.loading')}</div>}
        {rows && rows.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-12">
            {t('my.none')}<div className="mt-3"><Link to="/post" className="text-brand font-medium">{t('my.postSomething')}</Link></div>
          </div>
        )}

        <div className="space-y-2.5">
          {rows?.map((l) => {
            const active = l.active !== false;
            return (
              <div key={l._id} className="rounded-2xl bg-white p-3.5 shadow-card border border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{l.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{[l.job_role, l.city].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={`shrink-0 text-[11px] rounded-full px-2 py-0.5 ${STATUS_CLS[l.status] || STATUS_CLS.pending}`}>{t(`status.${l.status}`)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {l.status === 'approved' && <Link to={listingPath(l)} className="text-xs text-slate-500">{t('my.view')}</Link>}
                  <div className="ml-auto">
                    {l.status === 'approved' && (active
                      ? <button onClick={() => toggle(l._id, false)} className="text-xs rounded-lg border border-slate-300 text-slate-600 px-3 py-1.5">{t('my.hide')}</button>
                      : <button onClick={() => toggle(l._id, true)} className="text-xs rounded-lg bg-brand text-white px-3 py-1.5">{t('my.show')}</button>)}
                  </div>
                </div>
                {l.status === 'approved' && !active && <div className="text-[11px] text-slate-400 mt-1.5">{t('my.hidden')}</div>}
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </Frame>
  );
}
