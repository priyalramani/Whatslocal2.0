import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import { currentUser, logout } from '../lib/auth';
import { pendingCount } from '../lib/listings';
import { complaintsPendingCount } from '../lib/complaints';

const links = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/approvals', label: 'Approvals' },
  { to: '/admin/complaint-queue', label: 'Complaints' },
  { to: '/admin/wards', label: 'Wards' },
  { to: '/admin/user-report', label: 'User Report' },
  { to: '/admin/visitors', label: 'Visitors' },
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/user-view', label: 'User View' },
  { to: '/admin/sequence', label: 'Home Order' },
  { to: '/admin/post', label: '＋ Post' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const user = currentUser();
  // Live pending-approvals count → badge on the Approvals tab. Re-checked on each
  // route change so it clears as soon as the queue is worked through.
  const [pending, setPending] = useState(0);
  const [cmpPending, setCmpPending] = useState(0);
  useEffect(() => {
    pendingCount().then((r) => setPending(r.count)).catch(() => {});
    complaintsPendingCount().then((r) => setCmpPending(r.total)).catch(() => {});
  }, [loc.pathname]);
  const badge = (n: number) => (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-semibold align-middle">{n}</span>
  );
  return (
    <header className="bg-brand text-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="font-bold">{BRAND.displayName} · Admin</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-90 hidden sm:inline">{user?.username}</span>
          <button onClick={() => { logout(); nav('/admin/login', { replace: true }); }}
            className="rounded-lg bg-white/15 px-3 py-1 hover:bg-white/25">Logout</button>
        </div>
      </div>
      <nav className="max-w-5xl mx-auto px-4 flex gap-1">
        {links.map((l) => (
          <Link key={l.to} to={l.to}
            className={`px-3 py-2 text-sm rounded-t-lg ${loc.pathname === l.to ? 'bg-slate-100 text-slate-900' : 'text-white/85 hover:text-white'}`}>
            {l.label}
            {l.to === '/admin/approvals' && pending > 0 && badge(pending)}
            {l.to === '/admin/complaint-queue' && cmpPending > 0 && badge(cmpPending)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
