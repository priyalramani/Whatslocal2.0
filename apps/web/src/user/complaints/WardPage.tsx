import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { resolveCity } from '../../lib/city';
import { useT } from '../../lib/i18n';
import { mediaUrl } from '../../lib/api';
import { currentSession } from '../../lib/userAuth';
import { BottomNav } from '../BottomNav';
import { OtpLogin } from '../OtpLogin';
import { MemberContact } from './MemberContact';
import { CommentsSheet } from './CommentsSheet';
import {
  getWard, getWards, listComplaints, likeComplaint, shareComplaint,
  COMPLAINT_CATEGORIES, STATUS_META, type WardRow, type Complaint,
} from '../../lib/complaints';

const catOf = (k: string) => COMPLAINT_CATEGORIES.find((c) => c.key === k);

// Instagram-style relative time: now / 5m / 3h / 2d / 4w, then a date.
function timeAgo(s: string): string {
  const t = new Date(s).getTime();
  if (!t) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'now';
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w`;
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const AV = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-fuchsia-600', 'bg-teal-500', 'bg-orange-500'];
const avColor = (s: string) => AV[(s?.charCodeAt(0) || 0) % AV.length];

// ---- icons (Instagram action row) --------------------------------------
// "Me too": the ✋ emoji — faded/transparent while untapped, full-colour once tapped.
const MeToo = ({ on }: { on: boolean }) => (
  <span className={`text-[24px] leading-none ${on ? '' : 'grayscale opacity-40'}`}>✋</span>
);
const Bubble = () => (
  <svg viewBox="0 0 24 24" className="h-[25px] w-[25px] fill-none stroke-slate-800" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5Z" />
  </svg>
);
const Plane = () => (
  <svg viewBox="0 0 24 24" className="h-[25px] w-[25px] fill-none stroke-slate-800" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);

// ---- media carousel ----------------------------------------------------
function Media({ photos }: { photos: string[] }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  if (photos.length === 1) return <img src={mediaUrl(photos[0], 'view')} className="w-full aspect-square object-cover bg-slate-100" />;
  return (
    <div className="relative">
      <div ref={ref} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden">
        {photos.map((p) => <img key={p} src={mediaUrl(p, 'view')} className="w-full shrink-0 snap-center aspect-square object-cover bg-slate-100" />)}
      </div>
      <div className="absolute top-2 right-2 bg-black/55 text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{i + 1}/{photos.length}</div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
        {photos.map((_, j) => <span key={j} className={`h-1.5 w-1.5 rounded-full ${j === i ? 'bg-white' : 'bg-white/50'}`} />)}
      </div>
    </div>
  );
}

export function WardPage() {
  const { city: citySlug, ward: wardId = '' } = useParams();
  const city = resolveCity(citySlug);
  const { t, lang } = useT();
  const nav = useNavigate();
  const goBack = () => {
    const idx = (window.history.state && typeof window.history.state.idx === 'number') ? window.history.state.idx : 0;
    if (idx > 0) nav(-1); else nav(`/${city.slug}/complaints`);
  };

  const [ward, setWard] = useState<(WardRow & { city: string }) | null>(null);
  const [wardErr, setWardErr] = useState(false);
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(currentSession());
  const [login, setLogin] = useState(false);
  const [commentFor, setCommentFor] = useState<Complaint | null>(null);

  // New links pass the ward `_id`; legacy links (/ward/20) pass a plain number —
  // resolve those by number within the city so old bookmarks keep working.
  useEffect(() => {
    setWard(null); setWardErr(false);
    (async () => {
      try {
        let w: any = null;
        if (/^[0-9a-f]{24}$/i.test(wardId)) w = await getWard(wardId);
        else {
          const ws = await getWards(city.name);
          const found = ws.find((x) => String(x.number) === String(wardId));
          w = found ? { ...found, city: city.name } : null;
        }
        if (w) setWard(w); else setWardErr(true);
      } catch { setWardErr(true); }
    })();
  }, [wardId, city.name]);

  const loadPage = async (p: number, reset: boolean) => {
    if (!ward) return;
    setLoading(true);
    try {
      const r = await listComplaints({ city: city.name, body: ward.body, ward: ward.number, status, page: p });
      setItems((prev) => (reset || !prev ? r.results : [...prev, ...r.results]));
      setHasMore(p * r.page_size < r.total);
      setPage(p);
    } catch { if (reset) setItems([]); setHasMore(false); } finally { setLoading(false); }
  };

  // (re)load from page 1 once the ward loads or the filter changes
  useEffect(() => { if (!ward) return; setItems(null); setHasMore(true); setPage(1); loadPage(1, true); /* eslint-disable-next-line */ }, [ward?.id, status]);

  // infinite scroll — load older posts as the sentinel nears the viewport
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && hasMore && !loading) loadPage(page + 1, false);
    }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
    /* eslint-disable-next-line */
  }, [page, hasMore, loading, ward?.id, status]);

  async function onLike(c: Complaint) {
    if (!session) { setLogin(true); return; }
    setItems((prev) => prev?.map((x) => x.id === c.id ? { ...x, liked: !x.liked, like_count: x.like_count + (x.liked ? -1 : 1) } : x) || prev);
    try { await likeComplaint(c.id); }
    catch (e: any) {
      setItems((prev) => prev?.map((x) => x.id === c.id ? { ...x, liked: c.liked, like_count: c.like_count } : x) || prev);
      if (e?.status === 401) { setSession(null); setLogin(true); }
    }
  }
  async function onShare(c: Complaint) {
    const url = `${window.location.origin}/${city.slug}/complaints/c/${c.id}`;
    const text = `${c.title} — ${t('cmp.ward')} ${c.ward}, ${city.name}`;
    try {
      if (navigator.share) await navigator.share({ title: c.title, text, url });
      else await navigator.clipboard?.writeText(url);
    } catch { return; } // cancelled → don't count
    setItems((prev) => prev?.map((x) => x.id === c.id ? { ...x, share_count: (x.share_count || 0) + 1 } : x) || prev);
    shareComplaint(c.id).catch(() => {});
  }

  const open = (c: Complaint) => nav(`/${city.slug}/complaints/c/${c.id}`);

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-white shadow-xl flex flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
          <button onClick={goBack} aria-label={t('common.back')} className="text-slate-800 text-xl leading-none px-1">←</button>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 truncate leading-tight">{t('cmp.ward')} {ward?.number}{ward?.name ? ` · ${ward.name}` : ''}</div>
            {ward && <div className="text-[11px] text-slate-400 truncate">{ward.body}{ward.address ? ` · 📍 ${ward.address}` : ''}</div>}
          </div>
          <Link to={ward ? `/${city.slug}/complaints/new?ward=${ward.number}&body=${encodeURIComponent(ward.body)}` : '#'} aria-label={t('cmp.report')}
            className="h-9 w-9 shrink-0 rounded-full bg-brand text-white flex items-center justify-center text-2xl leading-none">＋</Link>
        </header>

        <main className="flex-1 pb-24">
          {/* ward member contact + filters (board header) */}
          <div className="px-3 pt-3 space-y-3">
            {ward && ward.members.length > 0 && <MemberContact members={ward.members} />}
            <div className="flex gap-2">
              {['open', 'resolved', 'all'].map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${status === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {t(`cmp.${s}`)}
                </button>
              ))}
            </div>
          </div>

          {wardErr && (
            <div className="text-center py-16 px-6">
              <div className="text-4xl mb-2">🔍</div>
              <div className="text-slate-400 text-sm">{t('cmp.noWards')}</div>
              <Link to={`/${city.slug}/complaints`} className="inline-block mt-4 rounded-full bg-brand text-white text-sm font-semibold px-5 py-2">← {t('cmp.title')}</Link>
            </div>
          )}
          {!wardErr && items === null && <div className="text-slate-400 text-sm text-center py-10">{t('common.loading')}</div>}
          {items && items.length === 0 && (
            <div className="text-center py-14 px-6">
              <div className="text-4xl mb-2">📭</div>
              <div className="text-slate-400 text-sm">{t('cmp.empty')}</div>
              <Link to={ward ? `/${city.slug}/complaints/new?ward=${ward.number}&body=${encodeURIComponent(ward.body)}` : '#'} className="inline-block mt-4 rounded-full bg-brand text-white text-sm font-semibold px-5 py-2">＋ {t('cmp.report')}</Link>
            </div>
          )}

          {/* the feed — newest first, edge-to-edge Instagram cards */}
          <div className="mt-3 divide-y-8 divide-slate-100">
            {(items || []).map((c) => {
              const cat = catOf(c.category); const st = STATUS_META[c.status] || STATUS_META.open;
              const hasPhotos = c.photos?.length > 0;
              return (
                <article key={c.id} className="bg-white">
                  {/* header: who + when */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className={`h-9 w-9 rounded-full ${avColor(c.poster_name)} text-white flex items-center justify-center text-sm font-bold shrink-0`}>
                      {(c.poster_name || '?').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-semibold text-sm text-slate-900 truncate">{c.poster_name || '—'}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {cat?.emoji} {lang === 'hi' ? cat?.hi : cat?.en} · {timeAgo(c.created_at)}{c.area ? ` · ${c.area}` : ''}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${st.cls}`}>{lang === 'hi' ? st.hi : st.en}</span>
                  </div>

                  {/* media (tap to open) */}
                  {hasPhotos && (
                    <div onClick={() => open(c)} className="cursor-pointer active:opacity-95">
                      <Media photos={c.photos} />
                    </div>
                  )}

                  {/* text-only post — big, Facebook-style */}
                  {!hasPhotos && (
                    <div onClick={() => open(c)} className="px-3 pb-1 cursor-pointer">
                      <div className="text-[17px] font-semibold text-slate-900 leading-snug">{c.title}</div>
                      {c.description && <p className="text-[15px] text-slate-700 mt-1.5 whitespace-pre-wrap leading-relaxed line-clamp-6">{c.description}</p>}
                    </div>
                  )}

                  {/* action row — each icon shows its count inline */}
                  <div className="flex items-center gap-5 px-3 pt-2.5 pb-1">
                    <button onClick={() => onLike(c)} aria-label={t('cmp.meToo')} className="flex items-center gap-1.5 active:scale-90 transition-transform">
                      <MeToo on={c.liked} />{c.like_count > 0 && <span className="text-sm font-medium text-slate-700">{c.like_count}</span>}
                    </button>
                    <button onClick={() => setCommentFor(c)} aria-label={t('cmp.commentAction')} className="flex items-center gap-1.5">
                      <Bubble />{c.comment_count > 0 && <span className="text-sm font-medium text-slate-700">{c.comment_count}</span>}
                    </button>
                    <button onClick={() => onShare(c)} aria-label={t('cmp.share')} className="flex items-center gap-1.5">
                      <Plane />{c.share_count > 0 && <span className="text-sm font-medium text-slate-700">{c.share_count}</span>}
                    </button>
                  </div>

                  {/* first-time nudge (only until someone marks "me too") */}
                  {c.like_count === 0 && <div className="px-3 pt-0.5 text-[13px] text-slate-400">{t('cmp.beFirstMeToo')}</div>}

                  {/* caption (for media posts: name + title + description) */}
                  {hasPhotos && (
                    <div onClick={() => open(c)} className="px-3 pt-1 text-sm cursor-pointer">
                      <span className="font-semibold text-slate-900">{c.poster_name || '—'}</span>{' '}
                      <span className="text-slate-900">{c.title}</span>
                      {c.description && <p className="text-slate-700 mt-0.5 whitespace-pre-wrap line-clamp-3">{c.description}</p>}
                    </div>
                  )}

                  {/* status note */}
                  <div className="px-3 pt-1 pb-3">
                    {c.disputed && <div className="text-[12px] text-rose-600">⚠ {t('cmp.disputed')}</div>}
                  </div>
                </article>
              );
            })}
          </div>

          {/* infinite-scroll sentinel / footer */}
          {items && items.length > 0 && (
            <div ref={sentinel} className="py-6 text-center text-xs text-slate-400">
              {loading ? t('common.loading') : !hasMore ? t('cmp.noMorePosts') : ''}
            </div>
          )}
        </main>
        <BottomNav />
      </div>

      {commentFor && (
        <CommentsSheet
          id={commentFor.id}
          onClose={() => setCommentFor(null)}
          onCount={(n) => setItems((prev) => prev?.map((x) => x.id === commentFor.id ? { ...x, comment_count: n } : x) || prev)}
        />
      )}
      {login && <OtpLogin title={t('cmp.loginToMeToo')} onSuccess={() => { setSession(currentSession()); setLogin(false); }} onClose={() => setLogin(false)} />}
    </div>
  );
}
