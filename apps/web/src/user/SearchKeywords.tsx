import { useState } from 'react';
import { MAX_KEYWORDS } from '@whatslocal/types';
import { useT } from '../lib/i18n';

// ONE simple "Search keywords" box. Free words — no dictionary, no suggestions,
// no per-keyword approval (admin reviews the whole listing). Space or Enter
// separates each word into a chip. Max 25.
export function SearchKeywords({
  value, onChange,
}: {
  tagKind?: 'business' | 'job';   // kept for call-site compatibility; unused
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');

  const atMax = value.length >= MAX_KEYWORDS;
  const sanitize = (s: string) => s.replace(/[^\p{L}\p{N} &-]/gu, '');

  function addWords(text: string) {
    const words = sanitize(text).split(/\s+/).map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    const next = [...value];
    for (const w of words) {
      if (next.length >= MAX_KEYWORDS) break;
      if (!next.some((x) => x.toLowerCase() === w.toLowerCase())) next.push(w);
    }
    onChange(next);
    setQ('');
  }
  function remove(w: string) { onChange(value.filter((x) => x !== w)); }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((w) => (
          <span key={w} className="text-xs bg-brand/10 text-brand rounded-full px-2.5 py-1 flex items-center gap-1">
            {w}
            <button type="button" onClick={() => remove(w)} className="text-brand/60 hover:text-brand">✕</button>
          </span>
        ))}
      </div>

      {!atMax && (
        <input
          value={q}
          onChange={(e) => {
            const v = sanitize(e.target.value);
            // Commit on space; keep the trailing partial word in the box.
            if (/\s/.test(v)) { const parts = v.split(/\s+/); const last = parts.pop() || ''; addWords(parts.join(' ')); setQ(last); }
            else setQ(v);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWords(q); } }}
          onBlur={() => { if (q.trim()) addWords(q); }}
          placeholder={t('kw.placeholder')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      )}
      <div className="text-[11px] text-slate-400 mt-1">
        {t('kw.helper', { n: value.length, max: MAX_KEYWORDS })}
      </div>

      {q.trim() && (
        <button type="button" onClick={() => addWords(q)} className="mt-1 text-xs text-brand">{t('kw.add', { q: q.trim() })}</button>
      )}
    </div>
  );
}
