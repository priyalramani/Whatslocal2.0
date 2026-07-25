import { useT, type Lang } from '../lib/i18n';

// Compact EN / हिं switch for the header. `onDark` styles it for the brand
// gradient header; otherwise a light variant.
export function LangToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang } = useT();
  const opts: { v: Lang; l: string }[] = [{ v: 'en', l: 'EN' }, { v: 'hi', l: 'हिं' }];
  const base = onDark ? 'bg-white/15' : 'bg-slate-100';
  const on = onDark ? 'bg-white text-brand' : 'bg-brand text-white';
  const off = onDark ? 'text-white/80' : 'text-slate-500';
  return (
    <div className={`inline-flex items-center rounded-full p-0.5 ${base}`}>
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => setLang(o.v)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-full transition ${lang === o.v ? on : off}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
