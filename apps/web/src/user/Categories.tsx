import { useNavigate } from 'react-router-dom';
import { trackFeaturedClick } from '../lib/analytics';
import { BottomNav } from './BottomNav';
import { useT } from '../lib/i18n';

const CATS = [
  { key: 'jobs', tk: 'cats.jobs', emoji: '💼', q: 'job', tint: 'bg-indigo-50' },
  { key: 'food', tk: 'cats.food', emoji: '🍴', q: 'food', tint: 'bg-orange-50' },
  { key: 'shops', tk: 'cats.shops', emoji: '🛍️', q: 'shop', tint: 'bg-sky-50' },
  { key: 'services', tk: 'cats.services', emoji: '🔧', q: 'service', tint: 'bg-emerald-50' },
  { key: 'health', tk: 'cats.health', emoji: '🩺', q: 'doctor', tint: 'bg-rose-50' },
  { key: 'sports', tk: 'cats.sports', emoji: '🏋️', q: 'sports gym fitness', tint: 'bg-lime-50' },
  { key: 'grocery', tk: 'cats.grocery', emoji: '🛒', q: 'grocery', tint: 'bg-amber-50' },
  { key: 'salon', tk: 'cats.salon', emoji: '💇', q: 'salon', tint: 'bg-violet-50' },
  { key: 'repair', tk: 'cats.repair', emoji: '🛠️', q: 'repair', tint: 'bg-teal-50' },
  { key: 'property', tk: 'cats.property', emoji: '🏠', q: 'property', tint: 'bg-lime-50' },
  { key: 'travel', tk: 'cats.travel', emoji: '🚕', q: 'travel', tint: 'bg-cyan-50' },
  { key: 'education', tk: 'cats.education', emoji: '📚', q: 'tuition', tint: 'bg-fuchsia-50' },
  { key: 'ngo', tk: 'cats.ngo', emoji: '🤝', q: 'ngo', tint: 'bg-pink-50' },
];

export function Categories() {
  const nav = useNavigate();
  const { t } = useT();
  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 pt-5 pb-5 rounded-b-3xl shadow-lg">
          <div className="text-[11px] text-white/70">{t('cats.browse')}</div>
          <div className="text-lg font-semibold">{t('cats.heading')}</div>
        </header>

        <main className="flex-1 px-4 py-4 pb-24">
          <div className="grid grid-cols-3 gap-3">
            {CATS.map((c) => (
              <button key={c.key}
                onClick={() => { trackFeaturedClick(c.key); nav(`/?q=${encodeURIComponent(c.q)}`); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl ${c.tint} border border-slate-100 py-5 shadow-card active:scale-95 hover:shadow-md transition`}>
                <span className="text-2xl">{c.emoji}</span>
                <span className="text-xs font-medium text-slate-700 text-center">{t(c.tk)}</span>
              </button>
            ))}
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
