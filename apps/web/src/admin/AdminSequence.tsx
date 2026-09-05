import { useEffect, useRef, useState } from 'react';
import {
  adminGetHomeSequence, adminSaveHomeSequence,
  getCategoryPhotoModes, adminSetCategoryPhotoMode,
  getCategoryContactAlerts, adminSetCategoryContactAlert,
} from '../lib/listings';

type Item = { id: string; type: string; key: string; label: string; emoji: string };

// Category Setting (was "Category Sequencing"). Two things per section:
//  1. Drag to reorder — the top-to-bottom order users see on Home.
//  2. For real categories (type 'cat'), a PHOTO requirement — whether a poster
//     choosing that category must / should / needn't add a photo. Enforced at
//     the posting form. Job/Event/Civic and the broad Buy-Sell-Rent sections
//     aren't single categories, so they carry no photo toggle.
export function AdminSequence() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [photoModes, setPhotoModes] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<Record<string, number>>({}); // Enough Contact Notification
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  async function load() {
    try {
      const [seq, modes, al] = await Promise.all([
        adminGetHomeSequence(), getCategoryPhotoModes(), getCategoryContactAlerts(),
      ]);
      setItems(seq.sequence as Item[]);
      setPhotoModes(modes || {});
      setAlerts(al || {});
    } catch (e: any) { setErr(e?.message || 'Failed'); }
  }
  useEffect(() => { load(); }, []);

  function move(from: number, to: number) {
    setItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
    setSaved(false);
  }
  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null; setOver(null);
    if (from == null || from === to) return;
    move(from, to);
  }

  async function save() {
    if (!items) return;
    setBusy(true); setErr('');
    try { await adminSaveHomeSequence(items.map((i) => i.id)); setSaved(true); }
    catch (e: any) { setErr(e?.message || 'Save failed'); }
    finally { setBusy(false); }
  }

  // Photo requirement changes save on their own (independent of the drag order).
  // Optimistic: reflect immediately, roll back if the server refuses.
  async function setPhoto(key: string, mode: string) {
    const prev = photoModes[key] || 'none';
    setPhotoModes((m) => {
      const next = { ...m };
      if (mode === 'none') delete next[key]; else next[key] = mode;
      return next;
    });
    try { await adminSetCategoryPhotoMode(key, mode); }
    catch (e: any) {
      setErr(e?.message || 'Could not save photo setting');
      setPhotoModes((m) => {
        const next = { ...m };
        if (prev === 'none') delete next[key]; else next[key] = prev;
        return next;
      });
    }
  }

  // "Enough Contact Notification" — update the local value as they type; persist
  // on blur (empty / 0 = None). Optimistic, rolls back if the server refuses.
  function setAlertLocal(key: string, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setAlerts((a) => {
      const next = { ...a };
      if (!n) delete next[key]; else next[key] = n;
      return next;
    });
  }
  async function saveAlert(key: string, raw: string) {
    const prev = alerts[key] || 0;
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    if (n === prev) return;
    try { await adminSetCategoryContactAlert(key, n); }
    catch (e: any) {
      setErr(e?.message || 'Could not save notification setting');
      setAlerts((a) => {
        const next = { ...a };
        if (!prev) delete next[key]; else next[key] = prev;
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-slate-800">Category Setting</h1>
          <button onClick={save} disabled={busy || !items}
            className="rounded-lg bg-brand text-white text-sm px-4 py-1.5 hover:bg-brand-dark disabled:opacity-50">
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save order'}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Drag to reorder the Home sections (empty ones are hidden automatically). Per section you can set whether a
          poster must add a <b>Photo</b>, and an <b>Enough Contact Notification</b> count (WhatsApp the poster once that
          many people have contacted their post — blank = None). Both save on their own.
        </p>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!items && <div className="text-slate-500">Loading…</div>}

        <div className="space-y-1.5">
          {items?.map((it, i) => (
            <div key={it.id}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDrop={() => onDrop(i)}
              className={`flex items-center gap-3 bg-white rounded-xl border px-3 py-2.5
                ${over === i ? 'border-brand ring-1 ring-brand' : 'border-slate-200'}`}>
              {/* Only the handle is draggable, so the photo <select> stays clickable. */}
              <span
                draggable
                onDragStart={() => { dragFrom.current = i; }}
                onDragEnd={() => { dragFrom.current = null; setOver(null); }}
                className="text-slate-300 select-none cursor-grab active:cursor-grabbing"
                title="Drag to reorder">⠿</span>
              <span className="text-xl">{it.emoji}</span>
              <span className="font-medium text-slate-800 flex-1 truncate">{it.label}</span>

              {/* Photo requirement — shown on EVERY section (categories, Sell/Rent,
                  Jobs/Events, Ward Complaints). */}
              {(
                <select
                  value={photoModes[it.id] || 'none'}
                  onChange={(e) => setPhoto(it.id, e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Photo requirement for this category"
                  className={`text-xs rounded-lg border px-2 py-1 bg-white
                    ${photoModes[it.id] === 'compulsory' ? 'border-red-300 text-red-700'
                      : photoModes[it.id] === 'soft' ? 'border-amber-300 text-amber-700'
                      : 'border-slate-200 text-slate-500'}`}>
                  <option value="none">📷 Not required</option>
                  <option value="compulsory">📷 Compulsory</option>
                  <option value="soft">📷 Soft warning</option>
                </select>
              )}

              {/* Enough Contact Notification — WhatsApp the poster once this many
                  distinct people have contacted their post. Blank = None. */}
              <input
                type="number" min={0} inputMode="numeric"
                value={alerts[it.id] ?? ''}
                onChange={(e) => setAlertLocal(it.id, e.target.value)}
                onBlur={(e) => saveAlert(it.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="None"
                title="Enough Contact Notification — WhatsApp the poster when this many people have contacted their post. Blank = None."
                className={`w-16 text-xs rounded-lg border px-2 py-1 bg-white
                  ${alerts[it.id] ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`} />

              <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${it.type === 'kind' ? 'bg-indigo-100 text-indigo-600' : it.type === 'special' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                {it.type === 'kind' ? 'Jobs / Events' : it.type === 'special' ? 'Civic' : 'Category'}
              </span>
              <span className="text-xs text-slate-300 w-6 text-right">{i + 1}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
