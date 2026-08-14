import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { PostType } from '@whatslocal/types';
import {
  createListing, adminCreateListing, pinLookup,
  getFullListing, updateMyListing, adminGetListing, adminUpdateListing,
  approveListing, rejectListing, setMyListingActive, setListingActive,
  checkDuplicate, type DupPosting,
} from '../lib/listings';
import { postTypeToKind } from '@whatslocal/types';
import { maybeAskPush } from '../lib/push';
import { currentSession, userLogout, requestOtp, loginWithOtp, verifyNumber } from '../lib/userAuth';
import { isAdmin } from '../lib/auth';
import { track } from '../lib/analytics';
import { SearchKeywords } from './SearchKeywords';
import { WeekHours } from './WeekHours';
import { OtpLogin } from './OtpLogin';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useT } from '../lib/i18n';
import { uploadPhoto, mediaUrl } from '../lib/api';
import { searchCategories, searchSellCategories, searchJobCategories, catLabel } from '../lib/listingMeta';
import { CATEGORY_BY_LABEL, MAX_CATEGORIES, SUGGESTED_KEYWORDS } from '@whatslocal/types';

// Local mirror of postTypeTagKind (avoids a cross-package runtime fn import).
const postTypeTagKind = (pt: PostType): 'business' | 'job' =>
  pt === 'hiring' || pt === 'job_seeker' ? 'job' : 'business';

// Dropdown groups. "Jobs" expands to a seeker/hiring toggle below.
const CATS = [
  { value: 'business', k: 'ptype.business' },
  { value: 'sell', k: 'ptype.sell' },
  { value: 'jobs', k: 'ptype.jobs' },
  { value: 'happening', k: 'ptype.happening' },
  { value: 'other', k: 'ptype.other' },
] as const;
type Cat = (typeof CATS)[number]['value'];

// postType → i18n key, for the duplicate-posting warning ("…in Job Seeker").
const DUP_TYPE_KEY: Record<string, string> = {
  business: 'ptype.businessShort', service: 'ptype.businessShort', ngo: 'ptype.businessShort',
  sell: 'ptype.sellShort', job_seeker: 'ptype.jobSeeker', hiring: 'ptype.hiring',
  happening: 'ptype.happeningShort', other: 'ptype.other',
};

// Null-guarded: alt_phone / whatsapp are optional and may be undefined on a
// fresh form, and norm() is called on them in validate()/buildPayload — an
// unguarded m.replace(...) crashed the whole submit (silent: no error, no post).
const norm = (m?: string | null) => String(m ?? '').replace(/\D/g, '').slice(-10);
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

// Admin quick DOB entry: auto-slash a digit string to dd/mm/yy, convert to/from
// the stored YYYY-MM-DD. 2-digit year pivots on the current year (≤ curYY → 20YY).
const maskDmy = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 6);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join('/');
};
const dmyToIso = (v: string): string => {
  const d = v.replace(/\D/g, '');
  if (d.length !== 6) return '';
  const dd = +d.slice(0, 2), mm = +d.slice(2, 4), yy = +d.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1) return '';
  const curYY = new Date().getFullYear() % 100;
  const year = yy <= curYY ? 2000 + yy : 1900 + yy;
  // Real day-count per month, with leap-year Feb (29 only on leap years).
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysIn = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  if (dd > daysIn) return '';
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};
const isoToDmy = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
};
// Human-readable preview of a dd/mm/yy entry, e.g. "01 Nov 2004" (empty if invalid).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmyPreview = (v: string): string => {
  const iso = dmyToIso(v);
  if (!iso) return '';
  const [y, m, dd] = iso.split('-');
  return `${dd} ${MON[+m - 1]} ${y}`;
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const req = /\*\s*$/.test(label);
  const text = label.replace(/\s*\*\s*$/, '');
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{text}{req && <span className="text-red-500"> *</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Shared multi-select category picker (business + sell). Mirrors a single UI:
// a search box, a 4-col tile grid (✓ marker, emoji, localized label), an n/max
// counter in the field label, and a no-match hint. `search` returns the catalog
// rows to show (business or sell). Selecting sets f.categories + f.category
// (first) + f.icon (first emoji).
function CategoryPicker({
  f, setF, query, setQuery, lang, t, search,
}: {
  f: any;
  setF: (u: (p: any) => any) => void;
  query: string;
  setQuery: (s: string) => void;
  lang: 'en' | 'hi';
  t: (k: string, vars?: any) => string;
  search: (q: string) => { key: string; label: string; emoji: string }[];
}) {
  const rows = search(query);
  return (
    <Field label={t('post.cats.label', { max: MAX_CATEGORIES, n: (f.categories || []).length })}>
      <div className="text-[11px] text-slate-400 mb-2">{t('post.cats.hint')}</div>
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('post.cats.searchPh')} className={`${input} mb-2`} />
      {/* Uniform tile height + a 2.5-row max-height so the third row peeks
          (half-visible) → users know the grid scrolls. */}
      <div className="grid grid-cols-4 gap-2 max-h-[205px] overflow-y-auto no-scrollbar p-0.5">
        {rows.map((c) => {
          const cur: string[] = f.categories || (f.category ? [f.category] : []);
          const on = cur.includes(c.label);
          const toggle = () => setF((p: any) => {
            const list: string[] = p.categories || (p.category ? [p.category] : []);
            let next: string[];
            if (list.includes(c.label)) next = list.filter((x) => x !== c.label);
            else if (list.length >= MAX_CATEGORIES) return p;   // cap reached
            else next = [...list, c.label];
            const icon = next[0] ? (CATEGORY_BY_LABEL[next[0]]?.emoji || '') : '';
            return { ...p, categories: next, category: next[0] || '', icon };
          });
          const disp = catLabel(c.label, lang);
          return (
            <button type="button" key={c.key} onClick={toggle} title={disp}
              className={`relative flex flex-col items-center justify-center gap-1 h-[78px] rounded-xl py-2 border text-[10px] ${on ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'}`}>
              {on && <span className="absolute top-1 right-1 text-brand text-[11px]">✓</span>}
              <span className="text-xl leading-none">{c.emoji}</span>
              <span className="leading-tight text-center px-0.5 line-clamp-2">{disp}</span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-4 text-center text-xs text-slate-400 py-3">{t('post.cats.noMatch')}</div>
        )}
      </div>
    </Field>
  );
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Photos section — optional, every post type. `keys` are stored photo keys
// (f.photos). Uploads happen immediately on select; each tile shows a spinner
// while uploading and a × to remove once done. First photo = cover.
function PhotoPicker({
  keys, setKeys, canUpload, t, setErr,
}: {
  keys: string[];
  setKeys: (next: string[]) => void;
  canUpload: boolean;
  t: (k: string, vars?: any) => string;
  setErr: (s: string) => void;
}) {
  // Pending uploads (not yet keyed) — rendered as dimmed spinner tiles.
  const [pending, setPending] = useState(0);
  // Keep a live ref so async uploads append onto the latest list.
  const keysRef = useRef<string[]>(keys);
  keysRef.current = keys;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file
    if (!files.length) return;
    // Room left after current keys + in-flight uploads.
    let room = MAX_PHOTOS - keys.length - pending;
    for (const file of files) {
      if (room <= 0) break;
      if (file.size > MAX_PHOTO_BYTES) { setErr(t('post.photos.tooBig')); continue; }
      room--;
      setPending((n) => n + 1);
      try {
        const r = await uploadPhoto(file);
        // Append onto the latest list, only if there's still room.
        const cur = keysRef.current;
        if (cur.length < MAX_PHOTOS) { const next = [...cur, r.key]; keysRef.current = next; setKeys(next); }
      } catch (err: any) {
        setErr(err?.message || t('post.photos.tooBig'));
      } finally {
        setPending((n) => n - 1);
      }
    }
  }

  if (!canUpload) {
    return (
      <Field label={t('post.photos.label')}>
        <div className="text-[13px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          {t('post.photos.loginFirst')}
        </div>
      </Field>
    );
  }

  const atMax = keys.length + pending >= MAX_PHOTOS;
  return (
    <Field label={t('post.photos.label')}>
      <div className="text-[11px] text-slate-400 mb-2">{t('post.photos.hint')} · {t('post.photos.max')}</div>
      <div className="flex flex-wrap gap-2">
        {keys.map((k, i) => (
          <div key={k} className="relative h-[72px] w-[72px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
            <img src={mediaUrl(k, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] font-semibold text-center py-0.5">
                {t('post.photos.cover')}
              </span>
            )}
            <button type="button" aria-label="Remove"
              onClick={() => setKeys(keys.filter((x) => x !== k))}
              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/55 text-white text-xs leading-none flex items-center justify-center">×</button>
          </div>
        ))}
        {Array.from({ length: pending }).map((_, i) => (
          <div key={`p${i}`} className="h-[72px] w-[72px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-brand animate-spin" />
          </div>
        ))}
        {!atMax && (
          <label className="h-[72px] w-[72px] rounded-xl border border-dashed border-slate-300 text-slate-400 flex flex-col items-center justify-center cursor-pointer hover:border-brand hover:text-brand transition">
            <span className="text-xl leading-none">＋</span>
            <span className="text-[9px] mt-0.5 text-center leading-tight px-1">{t('post.photos.add')}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
          </label>
        )}
      </div>
    </Field>
  );
}

// `admin` mode: posting from the admin panel. No OTP (admin is already
// authenticated) and the listing publishes immediately via the admin endpoint.
export function Post({ admin: adminProp = false }: { admin?: boolean }) {
  const { id: editId } = useParams();
  const nav = useNavigate();
  const { t, lang } = useT();
  const isEdit = !!editId;
  // A logged-in admin is treated as admin on ANY route (incl. the public /post),
  // so they never get the OTP flow and post/publish directly.
  const admin = adminProp || isAdmin();
  const [session, setSession] = useState(currentSession());
  const [dobText, setDobText] = useState('');   // admin quick-entry DOB (dd/mm/yy)
  // Pre-select the category when arriving from a home bucket (/post?cat=business).
  const [sp] = useSearchParams();
  const initCat = (CATS as readonly { value: string }[]).some((c) => c.value === sp.get('cat')) ? (sp.get('cat') as Cat) : 'jobs';
  const [cat, setCat] = useState<Cat>(initCat);
  // Deep-linked sub-type (from the post-prompt CTAs): ?mode=hiring, ?deal=rent.
  const [jobMode, setJobMode] = useState<'job_seeker' | 'hiring'>(sp.get('mode') === 'hiring' ? 'hiring' : 'job_seeker');
  const derived: PostType = cat === 'jobs' ? jobMode : cat;
  const [origPostType, setOrigPostType] = useState<string>('');
  const postType: PostType = derived;
  // Edit state
  const [active, setActive] = useState(true);
  const [statusVal, setStatusVal] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2000); };
  const [f, setF] = useState<any>({ title: '', mobile: session?.mobile || '', pincode: '441601', hide_title: false, call_ok: true, whatsapp_ok: true, alt_phone: '', whatsapp: '', ...(sp.get('deal') === 'rent' ? { sale_or_rent: 'rent' } : {}) });
  // ONE number, plus what it's good for. Both channels are on by default —
  // which is true for almost everyone. Unticking a channel opens an optional
  // cell for a DIFFERENT number that serves it (f.alt_phone for calls,
  // f.whatsapp for WhatsApp); leaving that blank simply means the channel is
  // off. The main number stays the poster's own, so OTP/ownership and duplicate
  // detection never depend on which channels they picked.
  const [chCall, setChCall] = useState(true);
  const [chWa, setChWa] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const keywordCount = keywords.length;
  // Category keys whose suggested keywords are currently reflected in `keywords`.
  const prevCatKeysRef = useRef<string[]>([]);
  const [pinInfo, setPinInfo] = useState<{ city: string; state: string } | null>(null);
  const [pinErr, setPinErr] = useState('');

  // Live PIN → city/state so the user can confirm they typed it right.
  useEffect(() => {
    const p = f.pincode;
    if (!/^\d{6}$/.test(p)) { setPinInfo(null); setPinErr(''); return; }
    let cancelled = false;
    pinLookup(p)
      .then((r) => { if (!cancelled) { setPinInfo({ city: r.city, state: r.state }); setPinErr(''); } })
      .catch(() => { if (!cancelled) { setPinInfo(null); setPinErr(t('post.pin.notFound')); } });
    return () => { cancelled = true; };
  }, [f.pincode]);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  // Duplicate-posting warning: existing postings with this number + kind that the
  // poster can edit. Checked on mobile-blur; dismissible ("continue with new").
  const [dup, setDup] = useState<DupPosting[] | null>(null);
  const dupDismissedRef = useRef<string>('');   // "<mobile>|<kind>" already dismissed
  const [busy, setBusy] = useState(false);

  // OTP-at-post state.
  const [otpStage, setOtpStage] = useState<'idle' | 'awaiting'>('idle');
  const [otp, setOtp] = useState('');
  const [more, setMore] = useState(false);
  const [catQuery, setCatQuery] = useState('');

  // Pre-fill the contact number with the logged-in user's number (create only).
  useEffect(() => {
    if (!isEdit && session?.mobile && !f.mobile) setF((p: any) => ({ ...p, mobile: session.mobile }));
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit mode: load the listing into the same form.
  useEffect(() => {
    if (!editId) return;
    if (!admin && !session) return; // owner logs in first (gate below)
    (admin ? adminGetListing : getFullListing)(editId)
      .then((d: any) => {
        if (d.post_type === 'hiring' || d.post_type === 'job_seeker') { setCat('jobs'); setJobMode(d.post_type); }
        else if (['business', 'service', 'ngo'].includes(d.post_type)) setCat('business');
        else setCat(d.post_type);
        setOrigPostType(d.post_type);
        setKeywords(d.free_keywords || []);
        const loadedCats = d.categories || (d.category ? [d.category] : []);
        // Seed the ref with the listing's existing categories so the auto-fill
        // effect doesn't treat an edit-load as "categories just added".
        prevCatKeysRef.current = loadedCats.map((lbl: string) => CATEGORY_BY_LABEL[lbl]?.key).filter(Boolean);
        setF({
          ...d,
          languages: Array.isArray(d.languages) ? d.languages.join(', ') : (d.languages || ''),
          categories: loadedCats,
          // Drive the experience yes/no toggle from the stored months.
          exp_required: !!((d as any).experience_required_months > 0),
          // Job timing toggle on only if the post actually has open days.
          has_timing: Array.isArray((d as any).week_hours) && (d as any).week_hours.some((x: any) => x?.open),
        });
        // Rebuild "one number + channels" from what's stored. The main number is
        // whichever channel the poster is actually reachable on; a stored number
        // that DIFFERS from it becomes that channel's separate cell.
        {
          const sCall = String(d.mobile || '');
          const sWa = String(d.whatsapp || '') || sCall;      // blank = same as mobile
          const callOn = d.call_ok !== false && !!(d.alt_phone || sCall);
          const waOn = d.whatsapp_ok !== false && !!sWa;
          const dialled = String(d.alt_phone || sCall);        // number calls go to
          const main = callOn ? dialled : sWa;
          setChCall(callOn && dialled === main);
          setChWa(waOn && sWa === main);
          setF((p: any) => ({
            ...p,
            mobile: main,
            alt_phone: callOn && dialled !== main ? dialled : '',
            whatsapp: waOn && sWa !== main ? sWa : '',
          }));
        }
        setDobText(isoToDmy((d as any).dob || ''));
        setActive(d.active !== false);
        setStatusVal(d.status || '');
      })
      .catch((e: any) => setErr(e?.message || t('post.err.load')));
  }, [editId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill starter keywords from the selected business sub-categories. Adding
  // a category appends its ~6 common search words; removing one pulls those back
  // out (unless another still-selected category also suggests them). Manual
  // words the lister types — and manual removals — are preserved across changes.
  useEffect(() => {
    if (postType !== 'business' && postType !== 'sell') return;
    const curKeys = (f.categories || [])
      .map((lbl: string) => CATEGORY_BY_LABEL[lbl]?.key)
      .filter(Boolean) as string[];
    const prevKeys = prevCatKeysRef.current;
    const added = curKeys.filter((k) => !prevKeys.includes(k));
    const removed = prevKeys.filter((k) => !curKeys.includes(k));
    if (added.length || removed.length) {
      setKeywords((prev) => {
        let next = [...prev];
        if (removed.length) {
          const keep = new Set(curKeys.flatMap((k) => SUGGESTED_KEYWORDS[k] || []).map((w) => w.toLowerCase()));
          const drop = new Set(
            removed.flatMap((k) => SUGGESTED_KEYWORDS[k] || [])
              .map((w) => w.toLowerCase())
              .filter((w) => !keep.has(w)),
          );
          next = next.filter((w) => !drop.has(w.toLowerCase()));
        }
        for (const k of added) {
          for (const w of (SUGGESTED_KEYWORDS[k] || [])) {
            if (next.length >= 25) break;
            if (!next.some((x) => x.toLowerCase() === w.toLowerCase())) next.push(w);
          }
        }
        return next;
      });
    }
    prevCatKeysRef.current = curKeys;
  }, [f.categories, postType]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const tagKind = postTypeTagKind(postType);
  const isJob = postType === 'hiring' || postType === 'job_seeker';
  // "Hide my number" is ONLY valid for Happening — guard it so the flag can't
  // leak onto another post type (e.g. switching News → Business mid-form).
  const hideNum = postType === 'happening' && !!f.hide_number;
  const isOwn = !!session && norm(f.mobile) === norm(session.mobile);

  // Edit URL for an existing posting — admin edits in the admin panel, users on
  // the public edit route. Opened in a NEW TAB so the current draft is kept.
  const editUrl = (id: string) => (admin ? `/admin/listings/${id}` : `/edit/${id}`);
  // On mobile-blur: warn if this number already has a posting in the SAME kind
  // that the poster can edit. Only runs when we can attribute results (logged in
  // or admin). Skips a number the user already chose to keep ("continue").
  async function runDupCheck() {
    const m = norm(f.mobile);
    if (m.length !== 10 || (!session && !admin)) return;
    const key = `${m}|${postType}`;
    if (dupDismissedRef.current === key) return;
    try {
      const r = await checkDuplicate(m, postTypeToKind(postType), isEdit ? editId : undefined, admin);
      if (r.results?.length) setDup(r.results);
    } catch { /* never block posting on the dup check */ }
  }

  // The DB field is always `title`, but the label/placeholder tell the user
  // what to put there for the category they picked.
  const TITLE: Record<string, { label: string; ph: string }> = {
    business: { label: t('post.title.business.label'), ph: t('post.title.business.ph') },
    sell: { label: t('post.title.sell.label'), ph: t('post.title.sell.ph') },
    hiring: { label: t('post.title.hiring.label'), ph: t('post.title.hiring.ph') },
    job_seeker: { label: t('post.title.job_seeker.label'), ph: t('post.title.job_seeker.ph') },
    happening: { label: t('post.title.happening.label'), ph: t('post.title.happening.ph') },
    other: { label: t('post.title.other.label'), ph: '' },
  };
  // Happening retitles by sub-type (Event name / Headline / Subject).
  const HAP_TITLE: Record<string, string> = { event: t('post.hap.title.event'), news: t('post.hap.title.news'), info: t('post.hap.title.info') };
  const titleLabel = postType === 'happening'
    ? (HAP_TITLE[f.happening_type] || (TITLE.happening.label))
    : (TITLE[postType] || TITLE.other).label;
  const titlePh = (TITLE[postType] || TITLE.other).ph;

  function validate(): boolean {
    if (!f.title || !/^\d{6}$/.test(f.pincode)) {
      setErr(t('post.err.required'));
      return false;
    }
    // The main number is ALWAYS required — it's the contact, whichever channels
    // it serves — and at least one channel has to be ticked or the number is
    // published for nothing. The optional per-channel numbers, when filled in,
    // must still be complete.
    if (!hideNum) {
      if (norm(f.mobile).length !== 10) { setErr(t('post.err.contact')); return false; }
      if (!chCall && !chWa) { setErr(t('post.err.pickChannel')); return false; }
      const alt = norm(f.alt_phone), waN = norm(f.whatsapp);
      if (!chCall && alt.length > 0 && alt.length !== 10) { setErr(t('post.err.altCall')); return false; }
      if (!chWa && waN.length > 0 && waN.length !== 10) { setErr(t('post.err.altWa')); return false; }
    } else if (norm(f.mobile).length !== 10) { setErr(t('post.err.contact')); return false; }
    if (isJob && !f.job_role?.trim()) { setErr(t('post.err.jobRole')); return false; }
    // A job role category is the classifier that powers role-based filtering.
    if (isJob && !(f.categories?.length)) { setErr(t('post.err.jobCategory')); return false; }
    if (postType === 'job_seeker' && !f.gender) { setErr(t('post.err.gender')); return false; }
    // Admin quick-DOB: block a typed-but-invalid date (wrong day/month/leap).
    if (admin && postType === 'job_seeker' && dobText.trim() && !f.dob) { setErr(t('post.dob.invalid')); return false; }
    if (postType === 'hiring' && !f.address?.trim()) { setErr(t('post.err.jobLoc')); return false; }
    if (postType === 'business') {
      if (!f.short_desc?.trim()) { setErr(t('post.err.shortDesc')); return false; }
      if (!(f.categories?.length)) { setErr(t('post.err.category')); return false; }
    }
    if (postType === 'sell' && !(f.categories?.length)) { setErr(t('post.err.category')); return false; }
    if (postType === 'happening') {
      if (!f.happening_type) { setErr(t('post.err.hapType')); return false; }
      // News & Info must carry a sub-heading + body so the card is useful.
      if (f.happening_type === 'news' || f.happening_type === 'info') {
        if (!f.short_desc?.trim()) { setErr(t('post.err.subtitle')); return false; }
        if (!f.description?.trim()) { setErr(t('post.err.description')); return false; }
      }
    }
    if (!isJob && keywordCount === 0) { setErr(t('post.err.keyword')); return false; }
    return true;
  }

  function buildPayload(mobileToken?: string) {
    // Resolve the "one number + channels" form into what the DB stores.
    //  • mobile     — the main number (identity/ownership); never blank
    //  • alt_phone  — a different CALLING number, only when the main one isn't
    //  • whatsapp   — a different WHATSAPP number, only when the main one isn't
    // A channel stays ON when the main number serves it, or when a separate
    // number was supplied for it; unticked with no number = that channel is off.
    const altCall = !chCall ? norm(f.alt_phone) : '';
    const altWa = !chWa ? norm(f.whatsapp) : '';
    const chCall2 = chCall || altCall.length === 10;
    const chWa2 = chWa || altWa.length === 10;
    const p: any = {
      post_type: isEdit ? (origPostType || postType) : postType, title: f.title, mobile: f.mobile, pincode: f.pincode,
      hide_title: !!f.hide_title,
      // Channels the poster ticked. The number backing each one is resolved
      // below; the server re-checks both so a flag can't be on with no number.
      call_ok: !hideNum && chCall2,
      whatsapp_ok: !hideNum && chWa2,
      hide_number: hideNum,
    };
    if (mobileToken) p.mobile_token = mobileToken;
    if (f.photos?.length) p.photos = f.photos;
    if (!isJob) p.free_keywords = keywords;
    if (isJob && f.job_role) p.job_role = f.job_role.trim();
    if (f.categories?.length) p.categories = f.categories;
    else if (f.category) p.category = f.category;
    if (f.icon) p.icon = f.icon;
    if (f.week_hours) p.week_hours = f.week_hours;
    // Hiring: timing is opt-in — clear it (incl. on edit) when the toggle is off.
    if (postType === 'hiring' && !f.has_timing) p.week_hours = [];
    if (f.dob) p.dob = f.dob;
    if (f.negotiable) p.negotiable = true;
    if (postType === 'job_seeker') p.experience_months = Number(f.experience_months || 0);
    // Custom CTAs — auto-prefix https:// so the http(s)-only rule passes.
    if (f.cta_url) { let u = String(f.cta_url).trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; p.cta_url = u; if (f.cta_label) p.cta_label = f.cta_label; }
    if (f.cta_url2) { let u = String(f.cta_url2).trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; p.cta_url2 = u; if (f.cta_label2) p.cta_label2 = f.cta_label2; }
    for (const k of ['whatsapp', 'address', 'short_desc', 'description', 'email', 'website', 'event_date', 'happening_type', 'offer_text', 'offer_valid_till', 'sale_or_rent', 'rent_period', 'job_type', 'gender', 'marital_status', 'gender_required', 'experience_description'])
      if (f[k]) p[k] = String(f[k]).trim();
    // Sell posts always carry an explicit sale_or_rent so they land in the right
    // home section (default "Selling" is never toggled → would save '' otherwise).
    if (postType === 'sell') p.sale_or_rent = f.sale_or_rent || 'sale';
    for (const k of ['price', 'established_year', 'expected_salary', 'salary_min', 'salary_max', 'age_min', 'age_max'])
      if (f[k] !== undefined && f[k] !== '' && f[k] !== null) p[k] = Number(f[k]);
    // Experience required only when the yes/no toggle is "yes"; otherwise 0
    // (explicit, so switching to "no" on an edit clears a previously-set value).
    if (postType === 'hiring') p.experience_required_months = f.exp_required ? Number(f.experience_required_months || 0) : 0;
    if (f.languages) p.languages = String(f.languages).split(',').map((s: string) => s.trim()).filter(Boolean);
    // Blank = "this channel uses the main number". Always sent explicitly so an
    // edit that re-ticks a channel clears the separate number it replaced.
    p.whatsapp = !hideNum && altWa.length === 10 ? altWa : '';
    p.alt_phone = !hideNum && altCall.length === 10 ? altCall : '';
    return p;
  }

  async function doSubmit(mobileToken?: string) {
    track('post_submit', { target: postType });
    if (isEdit) {
      await (admin ? adminUpdateListing : updateMyListing)(editId!, buildPayload());
      showToast(admin ? t('post.toast.saved') : t('post.toast.sentReview'));
      setTimeout(() => nav(admin ? '/admin/user-view' : `/l/${editId}`), 900);
      return;
    }
    await (admin ? adminCreateListing : createListing)(buildPayload(mobileToken));
    setDone(true);
    maybeAskPush('post');   // best moment to offer alerts — they just invested
  }

  // Click "Post"/"Save": edits & admin & own-number submit straight away;
  // a new post for someone else's number sends an OTP first.
  async function onPost(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!validate()) return;
    setBusy(true);
    try {
      if (isEdit || admin || isOwn) { await doSubmit(); return; }
      await requestOtp(f.mobile);
      setOtpStage('awaiting');
    } catch (e: any) {
      setErr(e?.message || t('post.err.otpSend'));
    } finally { setBusy(false); }
  }

  // Show / hide this listing (edit mode) with a toast.
  async function toggleActive() {
    if (!editId) return;
    const next = !active;
    try {
      await (admin ? setListingActive : setMyListingActive)(editId, next);
      setActive(next);
      showToast(next ? t('post.toast.visible') : t('post.toast.hidden'));
    } catch (e: any) { showToast(t('post.toast.couldNotUpdate')); }
  }
  async function decide(fn: (id: string) => Promise<any>) {
    if (!editId) return;
    await fn(editId); nav('/admin/approvals');
  }

  // Enter OTP → log in (new user) or verify the other number, then submit.
  async function onVerifyAndPost() {
    setErr(''); setBusy(true);
    try {
      if (!session) {
        const u = await loginWithOtp(f.mobile, otp); // first-time: OTP logs them in
        setSession(u);
        await doSubmit();                            // own number now
      } else {
        const r = await verifyNumber(f.mobile, otp); // logged in, different number
        await doSubmit(r.mobile_token);
      }
    } catch (e: any) {
      setErr(e?.message || t('post.err.otpInvalid'));
    } finally { setBusy(false); }
  }

  function postAnother() {
    setF({ title: '', mobile: session?.mobile || '', pincode: '441601', hide_title: false, call_ok: true, whatsapp_ok: true, alt_phone: '', whatsapp: '', photos: [] });
    setChCall(true); setChWa(true);
    setKeywords([]); prevCatKeysRef.current = []; setCat('business'); setJobMode('job_seeker'); setOtpStage('idle'); setOtp(''); setErr(''); setDone(false); setDobText('');
  }

  // Owner editing must be logged in.
  if (isEdit && !admin && !session) {
    return <OtpLogin title={t('post.loginToEdit')} onSuccess={() => setSession(currentSession())} />;
  }

  // Contact + pincode are shared, but Hiring reorders the form (Role → Pincode →
  // Area → Mobile), so they're extracted here and placed per layout below.
  const contactBlock = (
    <div>
      {/* ONE number. The ticks say what it's good for — both on by default,
          which is right for almost everyone. Untick one and an optional cell
          appears for a different number that serves that channel. */}
      <Field label={`${hideNum ? t('post.yourMobile') : t('post.contact.number')} *`}>
        <input className={input} value={f.mobile}
          onChange={(e) => { set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10)); setOtpStage('idle'); dupDismissedRef.current = ''; }}
          onBlur={runDupCheck}
          inputMode="numeric" placeholder={t('login.mobilePh')} />
      </Field>
      <div className="text-[11px] mt-1">
        {admin
          ? <span className="text-slate-400">{t('post.contact.adminHelp')}</span>
          : isOwn
            ? <span className="text-slate-400">{t('post.contact.ownHelp')}</span>
            : <span className="text-slate-400">{t('post.contact.otpHelp')}</span>}
      </div>

      {!hideNum && (
        <>
          <div className="flex items-center gap-5 mt-2.5">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={chCall}
                onChange={(e) => { setChCall(e.target.checked); if (e.target.checked) set('alt_phone', ''); }} />
              📞 {t('post.contact.onCall')}
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={chWa}
                onChange={(e) => { setChWa(e.target.checked); if (e.target.checked) set('whatsapp', ''); }} />
              <WhatsAppIcon className="h-4 w-4" /> {t('post.contact.onWa')}
            </label>
          </div>
          {!chCall && (
            <div className="mt-2.5">
              <Field label={t('post.contact.altCall')}>
                <input className={input} value={f.alt_phone || ''}
                  onChange={(e) => set('alt_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric" placeholder={t('login.mobilePh')} />
              </Field>
              <div className="text-[11px] text-slate-400 mt-1">{t('post.contact.altCall.note')}</div>
            </div>
          )}
          {!chWa && (
            <div className="mt-2.5">
              <Field label={t('post.contact.altWa')}>
                <input className={input} value={f.whatsapp || ''}
                  onChange={(e) => set('whatsapp', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric" placeholder={t('login.mobilePh')} />
              </Field>
              <div className="text-[11px] text-slate-400 mt-1">{t('post.contact.altWa.note')}</div>
            </div>
          )}
        </>
      )}
      {postType === 'happening' && (
        <label className="flex items-center gap-1.5 text-sm text-slate-600 mt-2">
          <input type="checkbox" checked={!!f.hide_number} onChange={(e) => set('hide_number', e.target.checked)} />
          🔒 {t('post.hideNumber')}
        </label>
      )}
      {hideNum && <div className="text-[11px] text-slate-400 mt-1">{t('post.hideNumber.note')}</div>}
    </div>
  );
  const pincodeBlock = (
    <Field label={t('post.pincode')}>
      <input className={input} value={f.pincode}
        onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric" maxLength={6} placeholder="441601" />
      <div className="text-[11px] mt-1">
        {pinInfo
          ? <span className="text-green-600">📍 {pinInfo.city}, {pinInfo.state}</span>
          : pinErr
            ? <span className="text-amber-600">{pinErr}</span>
            : <span className="text-slate-400">{t('post.pin.help')}</span>}
      </div>
    </Field>
  );

  return (
    <div className="min-h-screen bg-slate-200/70 flex justify-center">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white text-sm rounded-full px-4 py-2 shadow-lg">{toast}</div>
      )}
      {/* Success popup (modal) — keeps the page behind. */}
      {done && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-7 text-center">
            <div className="text-4xl">✅</div>
            <div className="text-lg font-semibold text-slate-800 mt-3">{admin ? t('post.done.adminTitle') : t('post.done.userTitle')}</div>
            <div className="text-sm text-slate-500 mt-1">{admin ? t('post.done.adminBody') : t('post.done.userBody')}</div>
            <div className="mt-6 flex flex-col gap-2">
              <Link to={admin ? '/admin/user-view' : '/'} className="rounded-lg bg-brand text-white font-medium py-2.5">{admin ? t('post.done.userView') : t('post.done.backSearch')}</Link>
              <button type="button" onClick={postAnother} className="text-sm text-slate-500 py-1">{t('post.done.another')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-[480px] min-h-screen bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Link to={isEdit ? (admin ? '/admin/user-view' : `/l/${editId}`) : (admin ? '/admin/user-view' : '/')} className="text-slate-400">←</Link>
            <span className="font-medium text-slate-800">{isEdit ? t('post.header.edit') : admin ? t('post.header.admin') : t('post.header.new')}</span>
          </div>
          {/* Edit: show/hide toggle. Create: context note. */}
          {isEdit ? (
            <button type="button" onClick={toggleActive}
              className="flex items-center gap-2 text-xs font-medium">
              <span className={active ? 'text-slate-600' : 'text-slate-400'}>{active ? t('post.visible') : t('post.hidden')}</span>
              <span className={`relative inline-block h-5 w-9 rounded-full transition ${active ? 'bg-brand' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${active ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
          ) : admin
            ? <span className="text-xs text-green-600 font-medium">{t('post.publishesNow')}</span>
            : session
              ? <button onClick={() => { userLogout(); setSession(null); }} className="text-xs text-slate-400">{session.mobile} · {t('common.logout')}</button>
              : <span className="text-xs text-slate-300">{t('post.noLogin')}</span>}
        </header>

        <form onSubmit={onPost} className="flex-1 px-5 py-5 space-y-4">
          <Field label={t('post.whatPosting')}>
            {isEdit ? (
              <div className={`${input} bg-slate-50 text-slate-500 flex items-center justify-between`}>
                <span>{t((CATS.find((c) => c.value === cat) || CATS[0]).k)}</span>
                <span className="text-[11px] text-slate-400">{t('post.cantChange')}</span>
              </div>
            ) : (
              <select className={input} value={cat} onChange={(e) => {
                setCat(e.target.value as Cat);
                // Categories belong to a specific catalog (business vs sell), so
                // switching post-type clears them to avoid cross-catalog leak.
                setF((p: any) => ({ ...p, categories: [], category: '', icon: '' }));
                setCatQuery(''); prevCatKeysRef.current = []; setKeywords([]);
              }}>
                {CATS.map((c) => <option key={c.value} value={c.value}>{t(c.k)}</option>)}
              </select>
            )}
          </Field>

          {cat === 'jobs' && (
            <div className="grid grid-cols-2 gap-2">
              {([['job_seeker', 'post.lookingJob'], ['hiring', 'post.hiringJob']] as const).map(([v, k]) => (
                <button type="button" key={v} disabled={isEdit} onClick={() => !isEdit && setJobMode(v)}
                  className={`rounded-lg py-2 text-sm border ${jobMode === v ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}

          {/* Happening: the FIRST question is Event / News / Info — it reshapes the
              whole form (title label, which fields are required, number privacy). */}
          {postType === 'happening' && (
            <Field label={t('post.hap.q')}>
              <div className="grid grid-cols-2 gap-2">
                {([['event', 'hap.event'], ['news', 'hap.news']] as const).map(([v, k]) => (
                  <button type="button" key={v}
                    onClick={() => setF((p: any) => ({ ...p, happening_type: v, hide_number: v === 'news' }))}
                    className={`rounded-lg py-2.5 text-sm border ${f.happening_type === v ? 'border-brand bg-brand/5 text-brand font-medium' : 'border-slate-200 text-slate-600'}`}>
                    {t(k)}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={titleLabel}>
            <input className={input} value={f.title} onChange={(e) => set('title', e.target.value)}
              placeholder={titlePh || undefined} />
          </Field>

          {/* Photos — optional, every post type. Upload needs a logged-in user
              (or admin); logged-out users see a muted "log in" note. */}
          <PhotoPicker
            keys={f.photos || []}
            setKeys={(next) => set('photos', next)}
            canUpload={admin || !!session}
            t={t} setErr={setErr} />

          {postType === 'business' && (
            <CategoryPicker f={f} setF={setF} query={catQuery} setQuery={setCatQuery}
              lang={lang} t={t} search={searchCategories} />
          )}

          {postType === 'sell' && <>
            {/* First question: selling vs renting — drives the categories shown,
                the price label, and whether a rent-period field appears. */}
            <Field label={t('post.sell.q')}>
              <div className="grid grid-cols-2 gap-2">
                {([['sale', 'post.sell.sale'], ['rent', 'post.sell.rent']] as const).map(([v, k]) => (
                  <button type="button" key={v}
                    onClick={() => {
                      if ((f.sale_or_rent || 'sale') === v) return;
                      // Switching mode: clear categories (one valid for the old
                      // mode may not exist in the new one) + reset the picker.
                      setF((p: any) => ({ ...p, sale_or_rent: v, categories: [], category: '', icon: '', ...(v === 'sale' ? { rent_period: '' } : {}) }));
                      setCatQuery(''); prevCatKeysRef.current = []; setKeywords([]);
                    }}
                    className={`rounded-lg py-2 text-sm border ${(f.sale_or_rent || 'sale') === v ? 'border-brand bg-brand/5 text-brand font-medium' : 'border-slate-200 text-slate-600'}`}>
                    {t(k)}
                  </button>
                ))}
              </div>
            </Field>
            <CategoryPicker f={f} setF={setF} query={catQuery} setQuery={setCatQuery}
              lang={lang} t={t} search={(q) => searchSellCategories(q, f.sale_or_rent || 'sale')} />
          </>}

          {postType === 'job_seeker' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={f.hide_title} onChange={(e) => set('hide_title', e.target.checked)} />
              {t('post.hideName')}
            </label>
          )}

          {/* Contact + pincode in their default spot — except Hiring, which places
              them in a custom order inside its own section below. */}
          {postType !== 'hiring' && contactBlock}
          {postType !== 'hiring' && pincodeBlock}

          {/* ===== Essentials by type (TOP) ===== */}
          {postType === 'business' && <>
            <Field label={t('post.shortDesc.label')}>
              <input className={input} value={f.short_desc || ''} maxLength={35}
                onChange={(e) => set('short_desc', e.target.value)} placeholder={t('post.shortDesc.ph')} />
              <div className="text-[11px] text-slate-400 mt-1 text-right">{(f.short_desc || '').length}/35</div>
            </Field>
            <Field label={t('post.fullDesc.label')}><textarea className={input} rows={3} value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder={t('post.fullDesc.ph')} /></Field>
            <Field label={t('post.address.label')}><input className={input} value={f.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('post.address.ph')} /></Field>
            <Field label={t('post.keywords.label')}>
              {(f.categories?.length > 0) && (
                <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
                  {t('post.keywords.hint')}
                </div>
              )}
              <SearchKeywords tagKind={tagKind} value={keywords} onChange={setKeywords} />
            </Field>
          </>}

          {postType === 'sell' && <>
            {/* Price label adapts to the mode; rent gets an extra period field. */}
            <Field label={(f.sale_or_rent || 'sale') === 'rent' ? t('post.price.rent') : t('post.price.sale')}>
              <input type="number" className={input} value={f.price || ''} onChange={(e) => set('price', e.target.value)} placeholder="0" />
            </Field>
            {(f.sale_or_rent || 'sale') === 'rent' && (
              <Field label={t('post.rent.period')}>
                <input className={input} value={f.rent_period || ''} onChange={(e) => set('rent_period', e.target.value)} placeholder={t('post.rent.periodPh')} />
              </Field>
            )}
            <Field label={t('post.keywords.label')}><SearchKeywords tagKind={tagKind} value={keywords} onChange={setKeywords} /></Field>
          </>}

          {postType === 'hiring' && <>
            {/* Order: Job Title (above) → Role/Position → Job category → Pincode → Area → Mobile. */}
            <Field label={t('post.jobRole.label')}><input className={input} maxLength={120} value={f.job_role || ''} onChange={(e) => set('job_role', e.target.value)} placeholder={t('post.jobRole.ph')} /></Field>
            {/* Role category (classifier) — free-text above is the specific title. */}
            <CategoryPicker f={f} setF={setF} query={catQuery} setQuery={setCatQuery}
              lang={lang} t={t} search={searchJobCategories} />
            {pincodeBlock}
            <Field label={t('post.jobLoc.label')}><input className={input} value={f.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('post.jobLoc.ph')} /></Field>
            {contactBlock}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('post.salaryMin')}><input type="number" className={input} value={f.salary_min || ''} onChange={(e) => set('salary_min', e.target.value)} /></Field>
              <Field label={t('post.salaryMax')}><input type="number" className={input} value={f.salary_max || ''} onChange={(e) => set('salary_max', e.target.value)} /></Field>
            </div>
            {/* Gender is important for hiring — kept up top, not hidden under "More". */}
            <Field label={t('post.genderRequired')}>
              <select className={input} value={f.gender_required || 'both'} onChange={(e) => set('gender_required', e.target.value)}>
                <option value="both">{t('opt.both')}</option><option value="male">{t('opt.male')}</option><option value="female">{t('opt.female')}</option>
              </select>
            </Field>
            {/* Experience: ask yes/no first (default no); only then ask months. */}
            <Field label={t('post.expReq.q')}>
              <div className="grid grid-cols-2 gap-2">
                {([['no', 'opt.no'], ['yes', 'opt.yes']] as const).map(([v, k]) => (
                  <button type="button" key={v}
                    onClick={() => setF((p: any) => ({ ...p, exp_required: v === 'yes', ...(v === 'no' ? { experience_required_months: '' } : {}) }))}
                    className={`rounded-lg py-2 text-sm border ${(f.exp_required ? 'yes' : 'no') === v ? 'border-brand bg-brand/5 text-brand font-medium' : 'border-slate-200 text-slate-600'}`}>
                    {t(k)}
                  </button>
                ))}
              </div>
            </Field>
            {f.exp_required && (
              <Field label={t('post.expReqMonths')}>
                <input type="number" min={0} className={input} value={f.experience_required_months || ''}
                  onChange={(e) => set('experience_required_months', e.target.value)} placeholder={t('post.expReq.monthsPh')} />
              </Field>
            )}
          </>}

          {postType === 'job_seeker' && <>
            <Field label={`${t('post.jobseeker.skills')} *`}>
              <textarea rows={3} className={input} maxLength={120} value={f.job_role || ''} onChange={(e) => set('job_role', e.target.value)} />
              <div className="text-[11px] text-slate-400 mt-1 text-right">{(f.job_role || '').length}/120</div>
            </Field>
            {/* Role category (classifier) — free-text above is what you specifically do. */}
            <CategoryPicker f={f} setF={setF} query={catQuery} setQuery={setCatQuery}
              lang={lang} t={t} search={searchJobCategories} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('post.expMonths')}><input type="number" min={0} className={input} value={f.experience_months ?? 0} onChange={(e) => set('experience_months', e.target.value)} /></Field>
              <Field label={`${t('post.gender')} *`}>
                <select className={input} value={f.gender || ''} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">—</option><option value="male">{t('opt.male')}</option><option value="female">{t('opt.female')}</option><option value="other">{t('opt.other')}</option>
                </select>
              </Field>
              <Field label={t('post.maritalStatus')}>
                <select className={input} value={f.marital_status || ''} onChange={(e) => set('marital_status', e.target.value)}>
                  <option value="">—</option>
                  <option value="single">{t('opt.single')}</option>
                  <option value="married">{t('opt.married')}</option>
                  <option value="divorced">{t('opt.divorced')}</option>
                  <option value="widowed">{t('opt.widowed')}</option>
                </select>
              </Field>
            </div>
            {admin ? (
              <Field label={`${t('post.dob')} — dd/mm/yy`}>
                <input className={input} value={dobText} inputMode="numeric" maxLength={8} placeholder="dd/mm/yy"
                  onChange={(e) => { const m = maskDmy(e.target.value); setDobText(m); set('dob', dmyToIso(m)); }} />
                {f.dob
                  ? <div className="text-[11px] text-green-600 mt-1">✓ {dmyPreview(dobText)}</div>
                  : dobText.trim()
                    ? <div className="text-[11px] text-amber-600 mt-1">{t('post.dob.invalid')}</div>
                    : <div className="text-[11px] text-slate-400 mt-1">{t('post.dob.hint')}</div>}
              </Field>
            ) : (
              <Field label={t('post.dob')}><input type="date" className={input} value={f.dob || ''} onChange={(e) => set('dob', e.target.value)} /></Field>
            )}
          </>}

          {postType === 'happening' && <>
            {/* Event → when it happens. News → a mandatory sub-heading + body. */}
            {f.happening_type === 'event' && <>
              <Field label={t('post.eventDate.label')}><input className={input} value={f.event_date || ''} onChange={(e) => set('event_date', e.target.value)} placeholder={t('post.eventDate.ph')} /></Field>
              <Field label={t('post.venue.label')}><input className={input} value={f.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('post.venue.ph')} /></Field>
            </>}
            {(f.happening_type === 'news' || f.happening_type === 'info') && <>
              <Field label={`${t('post.hap.subtitle')} *`}>
                <input className={input} value={f.short_desc || ''} maxLength={80}
                  onChange={(e) => set('short_desc', e.target.value)} placeholder={t('post.hap.subtitlePh')} />
                <div className="text-[11px] text-slate-400 mt-1 text-right">{(f.short_desc || '').length}/80</div>
              </Field>
              <Field label={`${f.happening_type === 'news' ? t('post.hap.story') : t('post.details')} *`}>
                <textarea className={input} rows={5} value={f.description || ''}
                  onChange={(e) => set('description', e.target.value)} placeholder={t('post.hap.bodyPh')} />
              </Field>
            </>}
            <Field label={t('post.keywords.label')}><SearchKeywords tagKind={tagKind} value={keywords} onChange={setKeywords} /></Field>
          </>}

          {postType === 'other' && (
            <Field label={t('post.keywords.label')}><SearchKeywords tagKind={tagKind} value={keywords} onChange={setKeywords} /></Field>
          )}

          {/* ===== More details (collapsible) ===== */}
          <button type="button" onClick={() => setMore((m) => !m)}
            className="w-full flex items-center justify-between text-sm font-medium text-brand py-1">
            <span>{more ? t('post.hideExtra') : t('post.more')}</span>
            <span>{more ? '▴' : '▾'}</span>
          </button>

          {more && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              {postType === 'business' && <>
                <Field label={t('post.openHours')}><WeekHours value={f.week_hours} onChange={(w) => set('week_hours', w)} /></Field>
                {/* Optional current offer → surfaces in "Offers in Gondia". */}
                <Field label={t('post.offer.label')}>
                  <input className={input} value={f.offer_text || ''} maxLength={120} onChange={(e) => set('offer_text', e.target.value)} placeholder={t('post.offer.ph')} />
                </Field>
                {f.offer_text?.trim() && (
                  <Field label={t('post.offer.validTill')}>
                    <input className={input} value={f.offer_valid_till || ''} onChange={(e) => set('offer_valid_till', e.target.value)} placeholder={t('post.offer.validTillPh')} />
                  </Field>
                )}
              </>}
              {postType === 'sell' && <>
                <Field label={t('post.desc.condition')}><textarea className={input} rows={3} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!f.negotiable} onChange={(e) => set('negotiable', e.target.checked)} /> {t('post.negotiable')}</label>
                <Field label={t('post.address.label')}><input className={input} value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
              </>}
              {postType === 'hiring' && <>
                <Field label={t('post.jobDesc.label')}><textarea className={input} rows={3} value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder={t('post.jobDesc.ph')} /></Field>
                <Field label={t('post.jobType')}><select className={input} value={f.job_type || ''} onChange={(e) => set('job_type', e.target.value)}><option value="">—</option><option value="full_time">{t('opt.fullTime')}</option><option value="part_time">{t('opt.partTime')}</option><option value="contract">{t('opt.contract')}</option><option value="internship">{t('opt.internship')}</option></select></Field>
                {/* Optional desired age range. */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('post.ageFrom')}><input type="number" min={0} className={input} value={f.age_min || ''} onChange={(e) => set('age_min', e.target.value)} placeholder={t('post.optional')} /></Field>
                  <Field label={t('post.ageTo')}><input type="number" min={0} className={input} value={f.age_max || ''} onChange={(e) => set('age_max', e.target.value)} placeholder={t('post.optional')} /></Field>
                </div>
                {/* Office timing is OFF by default — tick to add days & hours. */}
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={!!f.has_timing}
                    onChange={(e) => setF((p: any) => ({ ...p, has_timing: e.target.checked, ...(e.target.checked ? {} : { week_hours: [] }) }))} />
                  {t('post.addTiming')}
                </label>
                {f.has_timing && (
                  <Field label={t('post.workDaysTiming')}><WeekHours value={f.week_hours} onChange={(w) => set('week_hours', w)} /></Field>
                )}
                <Field label={t('post.langsComma')}><input className={input} value={f.languages || ''} onChange={(e) => set('languages', e.target.value)} placeholder={t('post.langs.ph')} /></Field>
              </>}
              {postType === 'job_seeker' && <>
                <Field label={t('post.aboutExp.label')}><textarea className={input} rows={3} value={f.experience_description || ''} onChange={(e) => set('experience_description', e.target.value)} placeholder={t('post.aboutExp.ph')} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('post.expectedSalary')}><input type="number" className={input} value={f.expected_salary || ''} onChange={(e) => set('expected_salary', e.target.value)} /></Field>
                  <Field label={t('post.jobType')}><select className={input} value={f.job_type || ''} onChange={(e) => set('job_type', e.target.value)}><option value="">{t('opt.any')}</option><option value="full_time">{t('opt.fullTime')}</option><option value="part_time">{t('opt.partTime')}</option></select></Field>
                </div>
                <Field label={t('post.langsKnown')}><input className={input} value={f.languages || ''} onChange={(e) => set('languages', e.target.value)} /></Field>
                <Field label={t('post.addressHome')}><input className={input} value={f.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('post.optional')} /></Field>
              </>}
              {postType === 'happening' && f.happening_type === 'event' && (
                <Field label={t('post.details')}><textarea className={input} rows={3} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
              )}
              {postType === 'other' && (
                <Field label={t('post.description')}><textarea className={input} rows={3} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
              )}

              {/* Up to two custom CTA buttons — not for job posts (don't fit). */}
              {!isJob && (
                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="text-sm font-medium text-slate-700">{t('post.cta.title')}</div>
                  <div className="text-[11px] text-slate-400">{t('post.cta.hint')}</div>
                  <div className="grid grid-cols-5 gap-2">
                    <input className={`${input} col-span-2`} value={f.cta_label || ''} maxLength={24} onChange={(e) => set('cta_label', e.target.value)} placeholder={t('post.cta.btn1')} />
                    <input className={`${input} col-span-3`} value={f.cta_url || ''} onChange={(e) => set('cta_url', e.target.value)} placeholder="https://…" />
                    <input className={`${input} col-span-2`} value={f.cta_label2 || ''} maxLength={24} onChange={(e) => set('cta_label2', e.target.value)} placeholder={t('post.cta.btn2')} />
                    <input className={`${input} col-span-3`} value={f.cta_url2 || ''} onChange={(e) => set('cta_url2', e.target.value)} placeholder="https://…" />
                  </div>
                </div>
              )}
              {/* WhatsApp number moved up next to the contact-mobile toggle. */}
            </div>
          )}

          {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

          {otpStage === 'awaiting' ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
              <div className="text-sm text-slate-700">{t('post.otp.enter', { mobile: norm(f.mobile) })}</div>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" placeholder={t('post.otpPh')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest" autoFocus />
              <button type="button" onClick={onVerifyAndPost} disabled={busy}
                className="w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-60">
                {busy ? t('post.verifying') : t('post.verifyPost')}
              </button>
            </div>
          ) : (
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-60">
              {busy ? t('post.pleaseWait') : isEdit ? t('post.saveChanges') : t('post.submit')}
            </button>
          )}

          {/* Admin: approve/reject a pending listing right here. */}
          {isEdit && admin && statusVal === 'pending' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => decide(approveListing)} className="flex-1 rounded-lg bg-slate-800 text-white text-sm py-2.5">{t('post.approve')}</button>
              <button type="button" onClick={() => decide(rejectListing)} className="flex-1 rounded-lg border border-slate-300 text-slate-600 text-sm py-2.5 hover:bg-slate-50">{t('post.reject')}</button>
            </div>
          )}
        </form>
      </div>

      {/* Duplicate-posting warning (same number + same kind, editable by you). */}
      {dup && dup.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDup(null)}>
          <div className="relative w-full max-w-[420px] rounded-2xl bg-white px-6 py-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-800">⚠️ {t('post.dup.title')}</div>
            <p className="text-sm text-slate-500 mt-1">
              {t('post.dup.body', { n: dup.length, type: t(DUP_TYPE_KEY[postType] || 'ptype.other') })}
            </p>
            <ul className="mt-3 space-y-1.5 max-h-52 overflow-y-auto">
              {dup.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-slate-700 truncate">
                    {d.title || 'Untitled'}
                    <span className="ml-1 text-[10px] uppercase text-slate-400">{d.status}</span>
                  </span>
                  <a href={editUrl(d.id)} target="_blank" rel="noopener noreferrer"
                    className="text-brand text-xs whitespace-nowrap hover:underline shrink-0">{t('post.dup.view')} ↗</a>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => dup.forEach((d) => window.open(editUrl(d.id), '_blank', 'noopener'))}
                className="flex-1 rounded-lg border border-brand text-brand text-sm font-medium py-2 hover:bg-brand/5">
                {dup.length > 1 ? t('post.dup.openAll', { n: dup.length }) : t('post.dup.openOne')}
              </button>
              <button type="button" onClick={() => { dupDismissedRef.current = `${norm(f.mobile)}|${postType}`; setDup(null); }}
                className="flex-1 rounded-lg bg-brand text-white text-sm font-medium py-2 hover:bg-brand-dark">
                {t('post.dup.continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
