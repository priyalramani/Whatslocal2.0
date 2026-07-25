import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import { currentUser, logout } from '../lib/auth';
import { pendingCount, adminReports } from '../lib/listings';
import { complaintsPendingCount } from '../lib/complaints';
import { LoginLimits } from './LoginLimits';

// BT/RG-style admin shell: a left sidebar (Dashboard + grouped Operations) with
// a content <Outlet>. Pages render only their own <main> — the frame lives here.
const itemCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-brand/10 text-brand font-medium' : 'text-slate-600 hover:bg-slate-100'}`;

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-semibold">{n}</span>;
}

export function AdminLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = currentUser();
  const [pending, setPending] = useState(0);
  const [reports, setReports] = useState(0);
  const [cmp, setCmp] = useState(0);
  const [limits, setLimits] = useState(false);

  useEffect(() => {
    pendingCount().then((r) => setPending(r.count)).catch(() => {});
    complaintsPendingCount().then((r) => setCmp(r.total)).catch(() => {});
    adminReports().then((r) => setReports(Array.isArray(r) ? r.length : 0)).catch(() => {});
  }, [loc.pathname]);

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-4 font-bold text-slate-800 border-b border-slate-100">{BRAND.displayName} <span className="text-slate-400 font-normal">· Admin</span></div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          <NavLink to="/admin" end className={itemCls}>Dashboard</NavLink>

          <div className="px-3 pt-4 pb-0.5 text-[11px] font-medium text-slate-400">Utility</div>
          <NavLink to="/admin/approvals" className={itemCls}>Posts Approval <Badge n={pending} /></NavLink>
          <NavLink to="/admin/reports" className={itemCls}>Reported Posts <Badge n={reports} /></NavLink>
          <NavLink to="/admin/complaint-queue" className={itemCls}>Complaints <Badge n={cmp} /></NavLink>
          <NavLink to="/admin/wards" className={itemCls}>Wards</NavLink>
          {/* Cab sharing is its own thing — perishable trips, not listings. */}
          <NavLink to="/admin/cab-sharing" className={itemCls}>Cab Sharing</NavLink>

          <div className="px-3 pt-3 pb-0.5 text-[11px] text-slate-400">Reports</div>
          {/* One page, two tabs: visitors + contacts. */}
          <NavLink to="/admin/user-report" className={itemCls}>User &amp; Contact Report</NavLink>
          <NavLink to="/admin/visitors" className={itemCls}>Visitors</NavLink>
          <NavLink to="/admin/registered" className={itemCls}>Registered users</NavLink>
          <NavLink to="/admin/posts" className={itemCls}>Posts</NavLink>

          <div className="px-3 pt-3 pb-0.5 text-[11px] text-slate-400">Settings</div>
          <NavLink to="/admin/sequence" className={itemCls}>Category Sequencing</NavLink>
          <button type="button" onClick={() => setLimits(true)}
            className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Login Limits</button>
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <NavLink to="/admin/post" className="block text-center rounded-lg bg-brand text-white py-2 text-sm font-medium hover:bg-brand-dark">＋ New Post</NavLink>
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="truncate">{user?.username}</span>
            <button onClick={() => { logout(); nav('/admin/login', { replace: true }); }} className="hover:text-slate-800 shrink-0">Logout</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>

      {limits && <LoginLimits onClose={() => setLimits(false)} />}
    </div>
  );
}
