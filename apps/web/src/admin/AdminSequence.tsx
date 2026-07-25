import { useEffect, useRef, useState } from 'react';
import { adminGetHomeSequence, adminSaveHomeSequence } from '../lib/listings';

type Item = { id: string; type: string; key: string; label: string; emoji: string };

// Drag-and-drop ordering of the home page sections (job kinds + business
// categories). Saved order drives what the user sees on Home, top to bottom.
export function AdminSequence() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  async function load() {
    try { const r = await adminGetHomeSequence(); setItems(r.sequence as Item[]); }
    catch (e: any) { setErr(e?.message || 'Failed'); }
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

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-slate-800">Category Sequencing</h1>
          <button onClick={save} disabled={busy || !items}
            className="rounded-lg bg-brand text-white text-sm px-4 py-1.5 hover:bg-brand-dark disabled:opacity-50">
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save order'}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Drag to reorder. This is the top-to-bottom order users see on Home (empty sections are hidden automatically).</p>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!items && <div className="text-slate-500">Loading…</div>}

        <div className="space-y-1.5">
          {items?.map((it, i) => (
            <div key={it.id}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDrop={() => onDrop(i)}
              onDragEnd={() => { dragFrom.current = null; setOver(null); }}
              className={`flex items-center gap-3 bg-white rounded-xl border px-3 py-2.5 cursor-grab active:cursor-grabbing
                ${over === i ? 'border-brand ring-1 ring-brand' : 'border-slate-200'}`}>
              <span className="text-slate-300 select-none">⠿</span>
              <span className="text-xl">{it.emoji}</span>
              <span className="font-medium text-slate-800 flex-1 truncate">{it.label}</span>
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
