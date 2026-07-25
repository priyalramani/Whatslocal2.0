import { useNavigate } from 'react-router-dom';

// A back handler that returns the user to wherever they actually came from
// (a POP, so ScrollMemory restores that page's scroll) — falling back to a given
// route only when there's no in-app history (e.g. they landed via a shared link).
export function useSmartBack(fallback: string) {
  const nav = useNavigate();
  return () => {
    const idx = (window.history.state && typeof window.history.state.idx === 'number') ? window.history.state.idx : 0;
    if (idx > 0) nav(-1); else nav(fallback);
  };
}
