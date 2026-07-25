import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { resolveCity } from '../lib/city';
import { getRecentViews } from '../lib/recentView';
import { track } from '../lib/analytics';

// "Reverse posting" prompt: infer what a visitor wants from their browsing, then
// invite them to post the complementary listing (browse jobs → post resume,
// etc.). Soft slide-up, shown once per session, per-intent cooldown so it never
// nags. Funnel is logged (post_prompt_shown → post_prompt_click → post_submit).

const VIEW_THRESHOLD = 2;                 // views of a vertical before we prompt
const DISMISS_COOLDOWN = 3 * 24 * 60 * 60 * 1000;    // 3 days if dismissed
const CONVERT_COOLDOWN = 30 * 24 * 60 * 60 * 1000;   // 30 days if they act
const ZERO_SEARCH_FRESH = 30 * 60 * 1000;            // services trigger validity

// intent → where the CTA lands (Post form) + its icon.
const INTENTS: Record<string, { cat: string; params: string; emoji: string }> = {
  jobs:     { cat: 'jobs',     params: '',            emoji: '💼' },
  hiring:   { cat: 'jobs',     params: '&mode=hiring', emoji: '🧑‍💼' },
  sell:     { cat: 'sell',     params: '',            emoji: '🏷️' },
  rent:     { cat: 'sell',     params: '&deal=rent',  emoji: '🏠' },
  services: { cat: 'business', params: '',            emoji: '🧰' },
};

function cdMap(): Record<string, number> { try { return JSON.parse(localStorage.getItem('wl_pp_cd') || '{}'); } catch { return {}; } }
function setCd(intent: string, ms: number) { try { const m = cdMap(); m[intent] = Date.now() + ms; localStorage.setItem('wl_pp_cd', JSON.stringify(m)); } catch { /* ignore */ } }
function inCd(intent: string): boolean { const m = cdMap(); return !!m[intent] && Date.now() < m[intent]; }

// Decide which prompt (if any) this visitor's behaviour has earned.
function pickIntent(): { intent: string; q?: string } | null {
  // 1) An unmet service search is the strongest, most specific signal.
  try {
    const z = JSON.parse(localStorage.getItem('wl_last_zero_search') || 'null');
    if (z && z.q && Date.now() - z.ts < ZERO_SEARCH_FRESH && !inCd('services')) return { intent: 'services', q: z.q };
  } catch { /* ignore */ }
  // 2) Else the vertical they've viewed ≥2 times, most-recently-engaged first.
  const views = getRecentViews();
  const keyOf = (v: any) => v.kind === 'job_opening' ? 'jobs' : v.kind === 'job_seeker' ? 'hiring' : v.vertical === 'sell' ? 'sell' : v.vertical === 'rent' ? 'rent' : null;
  const counts: Record<string, number> = {};
  for (const v of views) { const k = keyOf(v); if (k) counts[k] = (counts[k] || 0) + 1; }
  for (const v of views) {                       // views are newest-first
    const k = keyOf(v);
    if (k && (counts[k] || 0) >= VIEW_THRESHOLD && !inCd(k)) return { intent: k };
  }
  return null;
}

// The on-screen keyboard shrinks the VISUAL viewport but not the layout one, so
// a `position: fixed` card keeps its place and ends up hidden BEHIND the
// keyboard. Rather than chase it with offsets, don't show the prompt while
// someone is typing — a "post your listing" nudge on top of a search box is the
// wrong moment anyway. It appears once the keyboard is closed.
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      // Belt and braces: some browsers keep focus quirks, others only report the
      // viewport shrink. Either signal counts.
      const shrunk = !!vv && vv.height < window.innerHeight * 0.8;
      setOpen(typing || shrunk);
    };
    const late = () => setTimeout(check, 120);   // focus moves before the keyboard animates away
    check();
    vv?.addEventListener('resize', check);
    window.addEventListener('focusin', check);
    window.addEventListener('focusout', late);
    return () => {
      vv?.removeEventListener('resize', check);
      window.removeEventListener('focusin', check);
      window.removeEventListener('focusout', late);
    };
  }, []);
  return open;
}

export function PostPromptHost() {
  const loc = useLocation();
  const nav = useNavigate();
  const { t } = useT();
  const [prompt, setPrompt] = useState<{ intent: string; q?: string; city: string } | null>(null);
  const [slideIn, setSlideIn] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem('wl_pp_shown')) return;   // at most one prompt per session
    const p = loc.pathname;
    // Only on discovery surfaces (home / browse / feeds / categories) — never over
    // a listing, the post form, admin, complaints, or My Posts.
    const onFeed = /^\/[^/]+\/?$/.test(p) || /\/(browse|offers|new|cat|categories)(\/|$)/.test(p);
    const excluded = p === '/' || /\/(post|edit|admin|complaints|my|l)(\/|$)/.test(p);
    if (!onFeed || excluded) return;
    const slug = (p.match(/^\/([^/]+)/) || [])[1];
    if (!slug) return;
    const picked = pickIntent();
    if (!picked) return;
    const city = resolveCity(slug);
    const tm = setTimeout(() => setPrompt({ ...picked, city: city.name }), 1200);
    timers.current.push(tm);
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [loc.pathname]);

  // Count it as "shown" only when it can actually be SEEN — the keyboard gate
  // below can hold it back, and marking it earlier would burn the one prompt
  // this session on something the visitor never saw.
  const kbOpen = useKeyboardOpen();
  useEffect(() => {
    if (!prompt || kbOpen || sessionStorage.getItem('wl_pp_shown')) return;
    sessionStorage.setItem('wl_pp_shown', '1');
    track('post_prompt_shown', { target: prompt.intent });
    const tm = setTimeout(() => setSlideIn(true), 30);   // trigger the slide-up
    return () => clearTimeout(tm);
  }, [prompt, kbOpen]);

  if (!prompt || kbOpen) return null;
  const cfg = INTENTS[prompt.intent];
  const vars = { city: prompt.city, q: prompt.q || '' };
  const close = () => { setSlideIn(false); const tm = setTimeout(() => setPrompt(null), 260); timers.current.push(tm); };
  const dismiss = () => { setCd(prompt.intent, DISMISS_COOLDOWN); track('post_prompt_click', { target: 'dismiss_' + prompt.intent }); close(); };
  const go = () => {
    setCd(prompt.intent, CONVERT_COOLDOWN);
    track('post_prompt_click', { target: prompt.intent });
    close();
    nav(`/post?cat=${cfg.cat}${cfg.params}&pp=${prompt.intent}`);
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[58px] w-full max-w-[480px] px-3 z-40">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 transition-transform duration-300"
        style={{ transform: slideIn ? 'translateY(0)' : 'translateY(140%)' }}>
        <button onClick={dismiss} aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full text-slate-300 hover:bg-slate-100 flex items-center justify-center text-base">✕</button>
        <div className="flex gap-3 items-start pr-6">
          <span className="h-11 w-11 shrink-0 rounded-full bg-brand/10 flex items-center justify-center text-2xl">{cfg.emoji}</span>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-[15px] leading-snug">{t(`pp.${prompt.intent}.t`, vars)}</div>
            <div className="text-[13px] text-slate-500 mt-1 leading-snug">{t(`pp.${prompt.intent}.s`, vars)}</div>
          </div>
        </div>
        <button onClick={go}
          className="mt-3.5 w-full rounded-xl bg-brand text-white font-semibold py-2.5 hover:bg-brand-dark active:scale-[.99] transition flex items-center justify-center gap-1.5">
          {t(`pp.${prompt.intent}.c`)} <span aria-hidden="true">→</span>
        </button>
        <div className="text-center text-[11px] text-slate-400 mt-1.5">{t(`pp.${prompt.intent}.f`)}</div>
      </div>
    </div>
  );
}
