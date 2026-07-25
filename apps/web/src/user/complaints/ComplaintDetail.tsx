import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { resolveCity } from '../../lib/city';
import { useT } from '../../lib/i18n';
import { isAdmin } from '../../lib/auth';
import { mediaUrl } from '../../lib/api';
import { OtpLogin } from '../OtpLogin';
import { NameLoginGate } from './NameLoginGate';
import { MemberContact } from './MemberContact';
import {
  getComplaint, addComment, resolveComplaint, disputeComplaint, setComplaintStatus,
  approveComplaint, rejectComplaint, adminSetStatus,
  COMPLAINT_CATEGORIES, STATUS_META, type ComplaintDetail as CD,
} from '../../lib/complaints';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function ComplaintDetail() {
  const { city: citySlug, id = '' } = useParams();
  const city = resolveCity(citySlug);
  const { t, lang } = useT();
  const admin = isAdmin();
  const nav = useNavigate();
  const goBack = () => {
    const idx = (window.history.state && typeof window.history.state.idx === 'number') ? window.history.state.idx : 0;
    if (idx > 0) nav(-1); else nav(`/${city.slug}/complaints`);
  };
  const [d, setD] = useState<CD | null>(null);
  const [err, setErr] = useState('');
  const [login, setLogin] = useState(false);        // for poster/admin actions (resolve etc.)
  const [commentGate, setCommentGate] = useState(false); // login + one-time name for commenting
  const [ensured, setEnsured] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  // manage (ward member / admin): the "Can't take up" reason input
  const [cantMode, setCantMode] = useState(false);
  const [mReason, setMReason] = useState('');

  const load = () => getComplaint(id).then(setD).catch((e) => setErr(e?.message || 'Not found'));
  useEffect(() => { load(); }, [id]);

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-400">{err} <Link to={`/${city.slug}/complaints`} className="text-brand ml-2">←</Link></div>;
  if (!d) return <div className="min-h-screen flex items-center justify-center text-slate-400">{t('common.loading')}</div>;

  const cat = COMPLAINT_CATEGORIES.find((c) => c.key === d.category);
  const st = STATUS_META[d.status] || STATUS_META.open;
  const roleBadge = (r: string) => r === 'ward_member' ? t('cmp.wardMemberTag') : r === 'admin' ? 'Admin' : '';

  // Name comes from the account (set once at login) — never typed per comment.
  async function postComment() {
    if (!text.trim()) return;
    setNote('');
    try {
      const r = await addComment(id, { text: text.trim() });
      setText(''); setNote(r.status === 'pending' ? t('cmp.commentPending') : ''); load();
    } catch (e: any) { if (e?.status === 401) { setEnsured(false); setCommentGate(true); } else setNote(e?.message || 'Failed'); }
  }
  function doComment() {
    if (!text.trim()) return;
    if (!ensured) { setCommentGate(true); return; }   // login + name first, then post
    postComment();
  }
  async function act(fn: () => Promise<any>) { try { await fn(); load(); } catch (e: any) { if (e?.status === 401) setLogin(true); else setNote(e?.message || 'Failed'); } }
  // Ward-member / admin disposition: in_progress | resolved (mark done) | closed (can't take up, needs reason).
  async function setManage(status: string, reason = '') {
    setNote('');
    try { await setComplaintStatus(id, { status, reason }); setMReason(''); setCantMode(false); load(); }
    catch (e: any) { setNote(e?.message || 'Failed'); }
  }

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-brand text-white px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="text-white/80">←</button>
          <div className="font-semibold truncate">{t('cmp.title')}</div>
        </header>

        <main className="flex-1 px-4 py-4 pb-6 space-y-3">
          {/* ward member(s) contact — at the top */}
          {d.ward_members?.length > 0 && <MemberContact members={d.ward_members} />}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">{cat?.emoji} {lang === 'hi' ? cat?.hi : cat?.en} · {t('cmp.ward')} {d.ward}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{lang === 'hi' ? st.hi : st.en}</span>
            </div>
            <h1 className="text-lg font-semibold text-slate-800 mt-1">{d.title}</h1>
            <div className="text-[11px] text-slate-400">{t('cmp.by')} {d.poster_name} · {fmt(d.created_at)}{d.area ? ` · 📍 ${d.area}` : ''}</div>
            {d.description && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{d.description}</p>}
            {d.photos?.length > 0 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {d.photos.map((k) => <img key={k} src={mediaUrl(k, 'view')} className="h-40 rounded-lg object-cover" />)}
              </div>
            )}
            {/* Official disposition note */}
            {d.reason && (
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{lang === 'hi' ? st.hi : st.en}</span>
                <div className="text-slate-600">{d.reason}</div>
              </div>
            )}
            {d.disputed && <div className="mt-2 text-[12px] text-rose-600">⚠ {t('cmp.disputed')}</div>}
          </div>

          {/* admin: approve / reject a pending complaint (right from the post) */}
          {admin && d.status === 'pending' && (
            <div className="flex gap-2">
              <button onClick={() => act(() => approveComplaint(id))} className="flex-1 rounded-lg bg-emerald-600 text-white text-sm font-medium py-2">✓ {t('cmp.approve')}</button>
              <button onClick={() => act(() => rejectComplaint(id, 'Rejected by admin'))} className="flex-1 rounded-lg border border-rose-300 text-rose-600 text-sm font-medium py-2">{t('cmp.reject')}</button>
            </div>
          )}

          {/* poster / admin: mark done + reopen */}
          {(d.can_resolve || d.can_reopen) && (
            <div className="flex gap-2">
              {d.can_resolve && <button onClick={() => act(() => admin ? adminSetStatus(id, { status: 'resolved' }) : resolveComplaint(id))} className="flex-1 rounded-lg bg-emerald-600 text-white text-sm font-medium py-2">✓ {t('cmp.markDone')}</button>}
              {d.can_reopen && <button onClick={() => act(() => disputeComplaint(id))} className="flex-1 rounded-lg border border-rose-300 text-rose-600 text-sm font-medium py-2">{t('cmp.reopen')}</button>}
            </div>
          )}

          {/* ward member / admin manage — 3 actions */}
          {d.can_manage && (
            <div className="bg-white rounded-xl border border-brand/30 p-3">
              <div className="text-sm font-semibold text-slate-800 mb-2">🏛️ {t('cmp.updateStatus')}</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setManage('in_progress')} className="rounded-lg bg-blue-50 text-blue-700 text-xs font-medium py-2">{t('cmp.inProgress')}</button>
                <button onClick={() => setCantMode((v) => !v)} className={`rounded-lg text-xs font-medium py-2 ${cantMode ? 'bg-slate-300 text-slate-800' : 'bg-slate-100 text-slate-600'}`}>{t('cmp.cantTakeUp')}</button>
                <button onClick={() => setManage('resolved')} className="rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium py-2">{t('cmp.markDone')}</button>
              </div>
              {cantMode && (
                <div className="mt-2">
                  <textarea value={mReason} onChange={(e) => setMReason(e.target.value)} rows={2} placeholder={t('cmp.cantReasonPh')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2" />
                  <button onClick={() => mReason.trim() && setManage('closed', mReason.trim())} disabled={!mReason.trim()} className="w-full rounded-lg bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-50">{t('cmp.save')}</button>
                </div>
              )}
              {note && <div className="text-[11px] text-slate-500 mt-1.5">{note}</div>}
            </div>
          )}

          {/* comments */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800 mb-2">{t('cmp.comments')} ({d.comments.length})</div>
            <div className="space-y-2.5">
              {d.comments.map((c) => (
                <div key={c.id} className={`text-sm ${c.status === 'pending' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-700">{c.author_name || '—'}</span>
                    {roleBadge(c.author_role) && <span className="text-[9px] bg-brand/10 text-brand rounded px-1.5 py-0.5 font-medium">{roleBadge(c.author_role)}</span>}
                    {c.status === 'pending' && <span className="text-[9px] text-slate-400">({t('cmp.pending')})</span>}
                    <span className="text-[10px] text-slate-400 ml-auto">{fmt(c.created_at)}</span>
                  </div>
                  <div className="text-slate-600">{c.text}</div>
                </div>
              ))}
              {d.comments.length === 0 && <div className="text-xs text-slate-400">{t('cmp.noComments')}</div>}
            </div>
            {/* comment box */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('cmp.writeComment')} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button onClick={doComment} className="rounded-lg bg-brand text-white px-4 text-sm font-medium">{t('cmp.send')}</button>
              </div>
              {note && <div className="text-[11px] text-slate-500 mt-1.5">{note}</div>}
            </div>
          </div>
        </main>
      </div>

      {login && <OtpLogin title={t('cmp.loginToPost')} onSuccess={() => { setLogin(false); load(); }} onClose={() => setLogin(false)} />}
      {commentGate && <NameLoginGate onReady={() => { setCommentGate(false); setEnsured(true); postComment(); }} onClose={() => setCommentGate(false)} />}
    </div>
  );
}
