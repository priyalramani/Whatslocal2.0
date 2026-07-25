import { Post } from '../user/Post';

// Admin "+ Post" — the exact same posting form users get, but it publishes
// immediately (no approval queue) and skips the OTP step.
export function AdminPost() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Post admin />
    </div>
  );
}
