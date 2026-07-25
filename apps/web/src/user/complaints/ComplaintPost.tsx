import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { resolveCity } from '../../lib/city';
import { useT } from '../../lib/i18n';
import { currentSession } from '../../lib/userAuth';
import { uploadPhoto, mediaUrl } from '../../lib/api';
import { NameLoginGate } from './NameLoginGate';
import { getWards, getBodies, createComplaint, COMPLAINT_CATEGORIES, type WardRow, type Body } from '../../lib/complaints';

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

export function ComplaintPost() {
  const { city: citySlug } = useParams();
  const city = resolveCity(citySlug);
  const { t, lang } = useT();
  const nav = useNavigate();
  const [wards, setWards] = useState<WardRow[]>([]);
  const [bodies, setBodies] = useState<Body[]>([]);
  const [sp] = useSearchParams();
  const [f, setF] = useState<any>({ body: sp.get('body') || '', ward: sp.get('ward') || '', category: '', title: '', description: '', area: '', photos: [] });
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [agree, setAgree] = useState(false);
  // Login + one-time name are required to post — gate on entry ('entry') and
  // again if the token goes stale at submit ('retry', which re-submits after).
  const [gate, setGate] = useState<'entry' | 'retry' | null>('entry');
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Bodies (towns) first; default to the one from the query or the first town.
  useEffect(() => { getBodies(city.name).then((bs) => { setBodies(bs); setF((p: any) => p.body ? p : { ...p, body: bs[0]?.name || '' }); }).catch(() => {}); }, [city.name]);
  // Wards are scoped to the chosen body (numbers repeat across towns).
  useEffect(() => { if (!f.body) { setWards([]); return; } getWards(city.name, f.body).then(setWards).catch(() => setWards([])); }, [city.name, f.body]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    for (const file of files) {
      if ((f.photos?.length || 0) >= 5) break;
      try { const r = await uploadPhoto(file); setF((p: any) => ({ ...p, photos: [...(p.photos || []), r.key] })); } catch { /* ignore */ }
    }
  }
  async function submit() {
    setErr('');
    if (!f.ward) return setErr(t('cmp.err.ward'));
    if (!f.category) return setErr(t('cmp.err.category'));
    if (f.title.trim().length < 4) return setErr(t('cmp.err.title'));
    if (!agree) return setErr(t('cmp.err.agree'));
    // Token gone stale → re-auth via the gate, then re-submit. Name comes from
    // the account (set once at login), never from the form.
    if (!currentSession()) { setGate('retry'); return; }
    setBusy(true);
    try {
      await createComplaint({ ...f, ward: Number(f.ward), title: f.title.trim() });
      setOk(true);
    } catch (e: any) {
      if (e?.status === 401) setGate('retry');
      else setErr(e?.message || 'Failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-white shadow-xl flex flex-col">
        <header className="bg-brand text-white px-4 py-3 flex items-center gap-3">
          <Link to={`/${city.slug}/complaints`} className="text-white/80">←</Link>
          <div className="font-semibold">{t('cmp.report')}</div>
        </header>
        <div className="flex-1 px-5 py-5 space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px] px-3 py-2">
            {t('cmp.notice')}
          </div>

          {bodies.length > 1 && (
            <label className="block"><span className="text-sm text-slate-600">{t('cmp.town')} *</span>
              <select className={`${input} mt-1`} value={f.body} onChange={(e) => { set('body', e.target.value); set('ward', ''); }}>
                {bodies.map((b) => <option key={b.name} value={b.name}>{b.name}{b.taluka && b.taluka !== b.name ? ` · ${b.taluka}` : ''}</option>)}
              </select></label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm text-slate-600">{t('cmp.ward')} *</span>
              <select className={`${input} mt-1`} value={f.ward} onChange={(e) => set('ward', e.target.value)}>
                <option value="">—</option>
                {wards.map((w) => <option key={w.id} value={w.number}>{t('cmp.ward')} {w.number}{w.name ? ` · ${w.name}` : ''}</option>)}
              </select></label>
            <label className="block"><span className="text-sm text-slate-600">{t('cmp.category')} *</span>
              <select className={`${input} mt-1`} value={f.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">—</option>
                {COMPLAINT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {lang === 'hi' ? c.hi : c.en}</option>)}
              </select></label>
          </div>

          <label className="block"><span className="text-sm text-slate-600">{t('cmp.problem')} *</span>
            <input className={`${input} mt-1`} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={t('cmp.problemPh')} maxLength={120} /></label>
          <label className="block"><span className="text-sm text-slate-600">{t('cmp.details')}</span>
            <textarea className={`${input} mt-1`} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={t('cmp.detailsPh')} /></label>
          <label className="block"><span className="text-sm text-slate-600">{t('cmp.location')}</span>
            <input className={`${input} mt-1`} value={f.area} onChange={(e) => set('area', e.target.value)} placeholder={t('cmp.locationPh')} /></label>

          <div>
            <span className="text-sm text-slate-600">{t('cmp.photos')}</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {(f.photos || []).map((k: string, i: number) => (
                <div key={k} className="relative">
                  <img src={mediaUrl(k, 'thumb')} className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" onClick={() => set('photos', f.photos.filter((_: any, j: number) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white text-xs">×</button>
                </div>
              ))}
              {(f.photos?.length || 0) < 5 && (
                <label className="h-16 w-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-2xl cursor-pointer">
                  ＋<input type="file" accept="image/*" className="hidden" onChange={pick} /></label>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 text-[12px] text-slate-600 pt-1">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span>{t('cmp.agree')}</span>
          </label>

          {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <button onClick={submit} disabled={busy}
            className="w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-60">
            {busy ? '…' : t('cmp.submit')}
          </button>
          <p className="text-[11px] text-slate-400 text-center">{t('cmp.reviewNote')}</p>
        </div>
      </div>

      {gate && (
        <NameLoginGate
          onReady={() => {
            const mode = gate; setGate(null);
            if (mode === 'retry') submit();
          }}
          onClose={() => { if (gate === 'entry') nav(`/${city.slug}/complaints`); else setGate(null); }}
        />
      )}

      {/* Success popup (modal) — same format as a listing post; page stays behind. */}
      {ok && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-7 text-center">
            <div className="text-4xl">✅</div>
            <div className="text-lg font-semibold text-slate-800 mt-3">{t('cmp.submitted')}</div>
            <div className="text-sm text-slate-500 mt-1">{t('cmp.submittedBody')}</div>
            <div className="mt-6">
              <Link to={`/${city.slug}/complaints`}
                className="block rounded-lg bg-brand text-white font-medium py-2.5">{t('cmp.backToList')}</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
