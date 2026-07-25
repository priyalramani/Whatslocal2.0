import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPendingComplaints, adminPendingComments, approveComplaint, rejectComplaint,
  approveComment, rejectComment, COMPLAINT_CATEGORIES,
} from '../lib/complaints';

const catOf = (k: string) => COMPLAINT_CATEGORIES.find((c) => c.key === k);
const fmt = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function AdminComplaints() {
  const [complaints, setComplaints] = useState<any[] | null>(null);
  const [comments, setComments] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');

  const load = () => {
    adminPendingComplaints().then(setComplaints).catch(() => setComplaints([]));
    adminPendingComments().then(setComments).catch(() => setComments([]));
  };
  useEffect(() => { load(); }, []);

  async function act(key: string, fn: () => Promise<any>) { setBusy(key); try { await fn(); load(); } finally { setBusy(''); } }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-1">Complaints — review</h1>
        <p className="text-sm text-slate-500 mb-5">Every complaint and resident comment is held here until you approve it (official/ward-member comments post live).</p>

        <div className="font-semibold text-slate-700 mb-2">Pending complaints {complaints && <span className="text-sm font-normal text-slate-400">· {complaints.length}</span>}</div>
        <div className="space-y-2.5 mb-8">
          {(complaints || []).map((c) => {
            const cat = catOf(c.category);
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-[11px] text-slate-400">{cat?.emoji} {cat?.en} · Ward {c.ward} · {c.poster_name} · {fmt(c.created_at)}</div>
                <div className="font-semibold text-slate-800">{c.title}</div>
                {c.description && <div className="text-sm text-slate-600 mt-1 line-clamp-3">{c.description}</div>}
                <div className="flex gap-2 mt-2">
                  <button disabled={busy === c.id} onClick={() => act(c.id, () => approveComplaint(c.id))} className="rounded-lg bg-slate-800 text-white text-xs px-4 py-1.5">Approve</button>
                  <button disabled={busy === c.id} onClick={() => act(c.id, () => rejectComplaint(c.id, 'Rejected by admin'))} className="rounded-lg border border-slate-300 text-slate-600 text-xs px-4 py-1.5">Reject</button>
                </div>
              </div>
            );
          })}
          {complaints && complaints.length === 0 && <div className="text-sm text-slate-400">Nothing pending.</div>}
        </div>

        <div className="font-semibold text-slate-700 mb-2">Pending comments {comments && <span className="text-sm font-normal text-slate-400">· {comments.length}</span>}</div>
        <div className="space-y-2.5">
          {(comments || []).map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="text-[11px] text-slate-400">{m.author_name} · on "{m.complaint_title}" · {fmt(m.created_at)}</div>
              <div className="text-sm text-slate-700 mt-1">{m.text}</div>
              <div className="flex gap-2 mt-2">
                <button disabled={busy === m.id} onClick={() => act(m.id, () => approveComment(m.id))} className="rounded-lg bg-slate-800 text-white text-xs px-4 py-1.5">Approve</button>
                <button disabled={busy === m.id} onClick={() => act(m.id, () => rejectComment(m.id))} className="rounded-lg border border-slate-300 text-slate-600 text-xs px-4 py-1.5">Hide</button>
              </div>
            </div>
          ))}
          {comments && comments.length === 0 && <div className="text-sm text-slate-400">Nothing pending.</div>}
        </div>
      </main>
    </div>
  );
}
