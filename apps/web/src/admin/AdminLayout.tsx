import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import { currentUser, logout } from '../lib/auth';
import { pendingCount, adminReports } from '../lib/listings';
import { complaintsPendingCount } from '../lib/complaints';
import { LoginLimits } from './LoginLimits';
import { ContactSettings } from './ContactSettings';

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
  const [contact, setContact] = useState(false);
  // Mobile drawer. The sidebar is fixed-width and never collapsed before — on a
  // phone it ate ~240px of a ~390px screen, so every content page (esp. the wide
  // Posts table) was squeezed into a sliver AND the page itself scrolled sideways,
  // which stole the horizontal-swipe gesture from the table's own scroller. On
  // mobile the sidebar is now an off-canvas drawer and content gets full width,
  // so the page no longer scrolls sideways and the table scrolls on its own.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    pendingCount().then((r) => setPending(r.count)).catch(() => {});
    complaintsPendingCount().then((r) => setCmp(r.total)).catch(() => {});
    adminReports().then((r) => setReports(Array.isArray(r) ? r.length : 0)).catch(() => {});
    setMenuOpen(false);   // close the drawer whenever the route changes
  }, [loc.pathname]);

  return (
    <div className="min-h-screen md:flex bg-slate-100">
      {/* Mobile top bar — the only way to reach the drawer on a phone. */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-slate-200 px-4 h-14">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="text-slate-600 -ml-1 p-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <span className="font-bold text-slate-800">{BRAND.displayName} <span className="text-slate-400 font-normal">· Admin</span></span>
      </div>

      {/* Drawer backdrop (mobile, open only) */}
      {menuOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMenuOpen(false)} />}

      <aside className={`w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen top-0 z-50 fixed md:sticky transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="px-4 py-4 font-bold text-slate-800 border-b border-slate-100 flex items-center justify-between">
          <span>{BRAND.displayName} <span className="text-slate-400 font-normal">· Admin</span></span>
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="md:hidden text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

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
          <button type="button" onClick={() => setContact(true)}
            className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Contact Us</button>
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
      {contact && <ContactSettings onClose={() => setContact(false)} />}
    </div>
  );
}
