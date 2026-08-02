import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveCity } from '../lib/city';
import { useT, type Lang } from '../lib/i18n';
import { useSmartBack } from '../lib/useSmartBack';
import { currentSession, getMyProfile, userLogout, type UserSession } from '../lib/userAuth';
import { getGender, saveGender, getContact } from '../lib/profile';
import { OtpLogin } from './OtpLogin';
import { BottomNav } from './BottomNav';

// The profile screen — reached from the home-header person icon. Shows who we
// know the visitor to be, lets them switch language and set/fix gender inline,
// jump to My posts, and reach support via the admin-configured WhatsApp
// "Contact us". Works logged in OR anonymous (login becomes a button).
const GENDER_OPTS: { v: string; sym: string; key: string }[] = [
  { v: 'male', sym: '♂', key: 'gender.male' },
  { v: 'female', sym: '♀', key: 'gender.female' },
  { v: 'other', sym: '⚧', key: 'gender.other' },
];

function initialsOf(name: string, mobile: string): string {
  const n = name.trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return mobile ? mobile.slice(-2) : '👤';
}

export function Profile() {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const { t, lang, setLang } = useT();
  const back = useSmartBack(`/${city.slug}`);
  const nav = useNavigate();

  const [sess, setSess] = useState<UserSession | null>(currentSession());
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [login, setLogin] = useState(false);
  const [savingG, setSavingG] = useState(false);

  useEffect(() => {
    getGender().then((r) => setGender(r.gender)).catch(() => {});
    if (sess) getMyProfile().then((p) => setName(p.name || '')).catch(() => {});
    else setName('');
  }, [sess]);

  async function pickGender(g: string) {
    if (g === gender || savingG) return;
    setSavingG(true);
    setGender(g);   // optimistic
    try { await saveGender(g); } catch { /* keep the choice; retry on next open */ }
    finally { setSavingG(false); }
  }

  // Deep-link to WhatsApp with the admin-set number + pre-typed message.
  async function contactUs() {
    try {
      const c = await getContact();
      let num = (c.whatsapp || '').replace(/\D/g, '');
      if (!num) return;                       // not configured → no-op
      if (num.length === 10) num = '91' + num; // bare 10-digit → default India code
      const text = c.message ? `?text=${encodeURIComponent(c.message)}` : '';
      window.open(`https://wa.me/${num}${text}`, '_blank', 'noopener');
    } catch { /* ignore */ }
  }

  const row = 'flex items-center gap-3 px-4 py-3';
  const label = 'flex-1 text-[13px] text-slate-500';

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-slate-50 shadow-xl flex flex-col">
        <header className="bg-gradient-to-br from-brand to-brand-dark text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={back} aria-label={t('common.back')} className="text-white/80 text-lg">←</button>
          <div className="font-semibold text-lg">{t('profile.title')}</div>
        </header>

        <main className="flex-1 px-4 py-5 pb-28 space-y-4">
          {/* Identity */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-16 w-16 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xl font-semibold">
              {initialsOf(name, sess?.mobile || '')}
            </div>
            {sess ? (
              <>
                {name && <div className="text-[16px] font-semibold text-slate-900">{name}</div>}
                <div className="text-[13px] text-slate-500">+91 {sess.mobile}</div>
              </>
            ) : (
              <button onClick={() => setLogin(true)}
                className="mt-1 rounded-lg bg-brand text-white text-sm font-medium px-5 py-2 hover:bg-brand-dark">
                {t('profile.login')}
              </button>
            )}
          </div>

          {/* Details */}
          <div className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100">
            <div className={row}>
              <span>📍</span>
              <span className={label}>{t('profile.city')}</span>
              <span className="text-[13px] text-slate-800">{city.name}</span>
            </div>
            <div className={row}>
              <span>🌐</span>
              <span className={label}>{t('profile.language')}</span>
              <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5">
                {(['en', 'hi'] as Lang[]).map((v) => (
                  <button key={v} onClick={() => setLang(v)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full transition ${lang === v ? 'bg-brand text-white' : 'text-slate-500'}`}>
                    {v === 'en' ? 'EN' : 'हिं'}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span>⚧</span>
                <span className={label}>{t('profile.gender')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {GENDER_OPTS.map((o) => {
                  const on = gender === o.v;
                  return (
                    <button key={o.v} onClick={() => pickGender(o.v)}
                      className={`rounded-xl border-[1.5px] py-2 flex flex-col items-center gap-0.5 transition ${on ? 'border-brand bg-brand/10' : 'border-slate-200'}`}>
                      <span className={`text-lg leading-none ${on ? 'text-brand' : 'text-slate-500'}`}>{o.sym}</span>
                      <span className={`text-[11.5px] ${on ? 'text-brand font-medium' : 'text-slate-700'}`}>{t(o.key)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* My posts */}
          <button onClick={() => nav('/my')}
            className="w-full flex items-center gap-3 rounded-2xl bg-white border border-slate-100 px-4 py-3.5">
            <span>🗂️</span>
            <span className="flex-1 text-left text-[14px] text-slate-800">{t('profile.myPosts')}</span>
            <span className="text-slate-300">›</span>
          </button>

          {/* Contact us — WhatsApp deep link (admin number + message) */}
          <button onClick={contactUs}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-white font-medium py-3.5 active:scale-[.99] transition">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a11.882 11.882 0 005.71 1.454h.006c6.585 0 11.946-5.359 11.949-11.893a11.821 11.821 0 00-3.484-8.46z" />
            </svg>
            {t('profile.contact')}
          </button>

          {sess && (
            <div className="text-center pt-1">
              <button onClick={() => { userLogout(); setSess(null); }} className="text-[13px] text-rose-600">{t('profile.logout')}</button>
            </div>
          )}
        </main>

        {login && (
          <OtpLogin title={t('profile.login')}
            onSuccess={() => { setLogin(false); setSess(currentSession()); }}
            onClose={() => setLogin(false)} />
        )}
        <BottomNav />
      </div>
    </div>
  );
}
