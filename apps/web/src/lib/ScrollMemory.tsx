import { useEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Per-history-entry scroll memory. On a fresh navigation (PUSH/REPLACE) we jump
// to the top; on BACK/FORWARD (POP) we restore the scroll the user left this
// page at — retrying for a moment while async content (e.g. Home sections) loads
// so the target height exists before we land. Keyed by location.key so each
// history entry keeps its own position.
const positions = new Map<string, number>();

export function ScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    const key = location.key;
    const save = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });

    if (navType === 'POP') {
      const target = positions.get(key) ?? 0;
      let frames = 0;
      const restore = () => {
        window.scrollTo(0, target);
        frames += 1;
        if (Math.abs(window.scrollY - target) > 2 && frames < 50) requestAnimationFrame(restore);
      };
      requestAnimationFrame(restore);
    } else {
      window.scrollTo(0, 0);
    }

    return () => { save(); window.removeEventListener('scroll', save); };
  }, [location.key, navType]);

  return null;
}

// Same memory, for a scroller that ISN'T the window. A category/job grid lives in
// an `overflow-y-auto` container, so window.scrollY never moves — the component
// above has nothing to save, which is why coming back from a post always landed
// you at the top. Point this at the container instead.
//
// `ready` matters: on BACK the list is refetched, and setting scrollTop to 900
// while the container is still empty silently clamps to 0. So we hold the
// restore until there's content, then retry across a few frames while images
// settle. Restores once per history entry — never fights the user afterwards.
export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  name: string,
  ready = true,
) {
  const location = useLocation();
  const navType = useNavigationType();
  const key = `${location.key}:${name}`;
  const done = useRef('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `isConnected` is load-bearing. A DETACHED element reports scrollTop 0, and
    // the cleanup below runs after React has pulled the route's DOM out — so an
    // unguarded save there overwrote the real position with 0 on the way out,
    // every single time. Only trust the value while the node is in the document.
    const save = () => { if (el.isConnected) positions.set(key, el.scrollTop); };
    el.addEventListener('scroll', save, { passive: true });
    // Snapshot on click too, in the CAPTURE phase so it runs before the tile's
    // <Link> navigates. Scroll events alone are not a reliable record of where
    // you were: browsers coalesce and throttle them, and the last one can lag
    // the final position. A tap inside the grid is exactly the moment we care
    // about — the one that leads to "open post, come back".
    el.addEventListener('click', save, true);
    return () => {
      save();
      el.removeEventListener('scroll', save);
      el.removeEventListener('click', save, true);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current === key) return;
    // FRESH navigation (picking another category, a new page): start at the top.
    // This container is never remounted — only its contents swap — so without
    // an explicit reset it keeps the previous list's scroll position and the
    // new category opens halfway down.
    if (navType !== 'POP') { el.scrollTop = 0; done.current = key; return; }
    if (!ready) return;
    const target = positions.get(key) ?? 0;
    if (!target) { done.current = key; return; }
    // Retry on a TIMER, not requestAnimationFrame. rAF is throttled to nothing
    // when the tab isn't painting (backgrounded, or restored from bfcache), and
    // the restore would silently never run. Timers still fire. First attempt is
    // synchronous; the retries only exist to outlast images settling the height.
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      el.scrollTop = target;
      tries += 1;
      if (Math.abs(el.scrollTop - target) > 2 && tries < 40) timer = window.setTimeout(attempt, 25);
      else done.current = key;
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [key, navType, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
