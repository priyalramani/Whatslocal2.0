import { Home } from '../user/Home';

// Admin "User View" — renders the EXACT same Home page a user sees, so it can
// never drift from the real user experience: any change to the user view shows
// up here automatically. The only differences are the admin top nav (to switch
// sections) and the user-only bottom-nav actions (My Posts / Post) being
// disabled. Hidden listings are governed by the same rules as the live site.
export function AdminUserView() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Home adminPreview />
    </div>
  );
}
