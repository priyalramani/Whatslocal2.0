import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { NameLoginGate } from './NameLoginGate';
import { getComplaint, addComment, type ComplaintComment } from '../../lib/complaints';

const AV = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-fuchsia-600', 'bg-teal-500', 'bg-orange-500'];
const avColor = (s: string) => AV[(s?.charCodeAt(0) || 0) % AV.length];
function ago(s: string): string {
  const t = new Date(s).getTime(); if (!t) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'now';
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Instagram-style comments bottom sheet — slides up, covers ~70% of the screen.
// Reuses the complaint's comment thread + the same add-comment/login flow.
export function CommentsSheet({ id, onClose, onCount }: { id: string; onClose: () => void; onCount?: (n: number) => void }) {
  const { t } = useT();
  const [comments, setComments] = useState<ComplaintComment[] | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [gate, setGate] = useState(false);       // login + one-time name gate
  const [ensured, setEnsured] = useState(false); // cleared once we're logged in + named
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false); // synchronous in-flight guard — blocks double-submit (StrictMode/double-tap)
  const [dragY, setDragY] = useState(0);   // pull-down-to-close offset
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const startInThread = useRef(false);   // did the drag begin inside the scrollable list?

  const load = () => getComplaint(id).then((d) => { setComments(d.comments); onCount?.(d.comment_count); }).catch(() => setComments([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Back button / tap / drag all close via ONE synthetic history entry, so the
  // phone back button closes the drawer instead of navigating away. Guard the
  // push (don't double-push under StrictMode's dev remount) and NEVER call
  // history.back() in cleanup — that fires a popstate the remounted listener
  // catches, which flashes the sheet open→closed.
  useEffect(() => {
    if (!(window.history.state && (window.history.state as any).wlSheet)) {
      window.history.pushState({ wlSheet: true }, '');
    }
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line
  }, []);
  // Close by consuming our history entry (→ popstate → onClose), so both the
  // back button and a tap/drag leave history tidy.
  const closeSheet = () => {
    if (window.history.state && (window.history.state as any).wlSheet) window.history.back();
    else onClose();
  };

  // Drag the grab handle down to dismiss (and swallow the gesture so the browser
  // doesn't pull-to-refresh the page).
  // Drag down ANYWHERE in the sheet to dismiss. If the drag begins inside the
  // comment list and it can still scroll up, it's a scroll — not a dismiss.
  const onGrabStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
    dragged.current = false;
    startInThread.current = !!threadRef.current?.contains(e.target as Node);
  };
  const onGrabMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    const canDismiss = !startInThread.current || (threadRef.current ? threadRef.current.scrollTop <= 0 : true);
    if (dy > 0 && canDismiss) { dragged.current = true; setDragY(dy); }
    else if (dy <= 0 && dragY) setDragY(0);
  };
  const onGrabEnd = () => { if (dragY > 90) closeSheet(); else setDragY(0); dragStart.current = null; };

  const roleBadge = (r: string) => r === 'ward_member' ? t('cmp.wardMemberTag') : r === 'admin' ? t('cmp.official') : '';

  // Name is taken from the account (set once at login) — never typed per comment.
  async function doSend() {
    const body = text.trim();
    if (!body || busyRef.current) return;
    busyRef.current = true; setSending(true); setNote('');
    try {
      const r = await addComment(id, { text: body });
      setText(''); setNote(r.status === 'pending' ? t('cmp.commentPending') : '');
      // newest is on top → scroll the thread up so the just-posted comment shows.
      load().then(() => threadRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (e: any) {
      if (e?.status === 401) { setEnsured(false); setGate(true); } else setNote(e?.message || 'Failed');
    } finally { busyRef.current = false; setSending(false); }
  }
  function send() {
    if (!text.trim()) return;
    if (!ensured) { setGate(true); return; }   // ask login + name first, then post
    doSend();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center items-end">
      <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
      <div className="relative w-full max-w-[480px] h-[70vh] bg-white rounded-t-2xl shadow-2xl flex flex-col animate-sheet-up overscroll-contain"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform .2s ease' }}
        onTouchStart={onGrabStart} onTouchMove={onGrabMove} onTouchEnd={onGrabEnd}>
        {/* grab handle — tap to close (drag-to-close works anywhere in the sheet) */}
        <div className="pt-2 pb-2 border-b border-slate-100 shrink-0 select-none cursor-grab"
          onClick={() => { if (!dragged.current) closeSheet(); }}>
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" />
          <div className="text-center text-sm font-semibold text-slate-800 mt-2">{t('cmp.comments')}</div>
        </div>

        {/* thread — newest first */}
        <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
          {comments === null && <div className="text-center text-slate-400 text-sm py-6">{t('common.loading')}</div>}
          {comments && comments.length === 0 && <div className="text-center text-slate-400 text-sm py-12">{t('cmp.noComments')}</div>}
          {(comments ? comments.slice().reverse() : []).map((c) => (
            <div key={c.id} className={`flex gap-2.5 ${c.status === 'pending' ? 'opacity-60' : ''}`}>
              <div className={`h-8 w-8 rounded-full ${avColor(c.author_name)} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
                {(c.author_name || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight">
                  <span className="font-semibold text-slate-800">{c.author_name || '—'}</span>
                  {roleBadge(c.author_role) && <span className="ml-1.5 text-[9px] bg-brand/10 text-brand rounded px-1.5 py-0.5 font-medium align-middle">{roleBadge(c.author_role)}</span>}
                  <span className="text-[10px] text-slate-400 ml-2">{ago(c.created_at)}</span>
                </div>
                <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{c.text}</div>
                {c.status === 'pending' && <div className="text-[10px] text-slate-400 mt-0.5">({t('cmp.pending')})</div>}
              </div>
            </div>
          ))}
        </div>

        {/* emoji quick-insert row */}
        <div className="flex justify-between px-3 pt-1.5 text-[22px] shrink-0">
          {['✋', '🙏', '❤️', '👍', '🔥', '😮', '😭', '😡'].map((e) => (
            <button key={e} type="button" onClick={() => setText((v) => v + e)} className="active:scale-90 transition-transform">{e}</button>
          ))}
        </div>

        {/* composer */}
        <div className="border-t border-slate-100 px-3 py-2 shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {note && <div className="text-[11px] text-slate-500 mb-1 px-1">{note}</div>}
          <div className="flex items-center gap-2">
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={t('cmp.addComment')} className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm outline-none focus:bg-slate-100" />
            <button onClick={send} disabled={!text.trim() || sending} className="text-brand font-semibold text-sm px-2 disabled:text-slate-300">{t('cmp.send')}</button>
          </div>
        </div>
      </div>

      {gate && <NameLoginGate onReady={() => { setGate(false); setEnsured(true); doSend(); }} onClose={() => setGate(false)} />}
    </div>
  );
}
