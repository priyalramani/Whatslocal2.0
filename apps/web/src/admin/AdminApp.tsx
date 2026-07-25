import { Routes, Route, Navigate } from 'react-router-dom';
import { currentUser } from '../lib/auth';
import { AdminLayout } from './AdminLayout';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { AdminApprovals } from './AdminApprovals';
import { AdminReports } from './AdminReports';
import { AdminPost } from './AdminPost';
import { AdminSequence } from './AdminSequence';
import { AdminVisitors } from './AdminVisitors';
import { AdminVisitorDetail } from './AdminVisitorDetail';
import { AdminRegistered } from './AdminRegistered';
import { AdminUserReport } from './AdminUserReport';
import { AdminPosts } from './AdminPosts';
import { AdminWards } from './AdminWards';
import { AdminComplaints } from './AdminComplaints';
import { AdminCabs } from './AdminCabs';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  return currentUser()?.role === 'admin' ? <>{children}</> : <Navigate to="/admin/login" replace />;
}

// Admin is responsive (mobile + PC). The sidebar shell (AdminLayout) wraps every
// authed page via a layout route; pages render only their own content.
export function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route path="" element={<AdminDashboard />} />
        {/* Operations · Utility */}
        <Route path="approvals" element={<AdminApprovals />} />
        <Route path="reports" element={<AdminReports />} />
        {/* NOT "complaints" — that collides with the public /:city/complaints route
            (a static 2nd segment out-ranks the /admin/* splat in RR v6), which
            renders the user page here. Any admin path equal to a static user
            route word must be renamed like this. */}
        <Route path="complaint-queue" element={<AdminComplaints />} />
        <Route path="wards" element={<AdminWards />} />
        {/* "cab-sharing", NOT "cabs" — /:city/cabs is a static public route and
            would swallow /admin/cabs (see the complaint-queue note above). */}
        <Route path="cab-sharing" element={<AdminCabs />} />
        {/* Operations · Reports */}
        <Route path="user-report" element={<AdminUserReport />} />
        <Route path="visitors" element={<AdminVisitors />} />
        <Route path="visitors/:visitorId" element={<AdminVisitorDetail />} />
        <Route path="registered" element={<AdminRegistered />} />
        <Route path="posts" element={<AdminPosts />} />
        {/* Operations · Settings */}
        <Route path="sequence" element={<AdminSequence />} />
        {/* Posting */}
        <Route path="post" element={<AdminPost />} />
        <Route path="listings/:id" element={<AdminPost />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
