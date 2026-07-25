import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminGetWards, adminUpsertWard, getBodies } from '../lib/complaints';

const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm w-full';
type Member = { name: string; mobile: string };
const blank = () => ({ body: '', number: '', name: '', members: [{ name: '', mobile: '' }] as Member[] });

export function AdminWards() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [bodies, setBodies] = useState<any[]>([]);
  const [f, setF] = useState(blank());
  const [msg, setMsg] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const setM = (i: number, k: keyof Member, v: string) => setF((p) => ({ ...p, members: p.members.map((m, j) => j === i ? { ...m, [k]: k === 'mobile' ? v.replace(/\D/g, '').slice(0, 10) : v } : m) }));

  const load = () => adminGetWards().then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    getBodies().then((bs) => { setBodies(bs); setF((p) => p.body ? p : { ...p, body: bs[0]?.name || '' }); }).catch(() => {});
  }, []);

  async function save() {
    setMsg('');
    if (!f.body) { setMsg('Pick a town / body'); return; }
    if (!f.number) { setMsg('Ward number required'); return; }
    const b = bodies.find((x) => x.name === f.body);
    try {
      await adminUpsertWard({
        number: Number(f.number), name: f.name,
        body: f.body, taluka: b?.taluka || f.body, body_type: b?.type || 'municipal',
        members: f.members.filter((m) => m.name || m.mobile),
      });
      setF({ ...blank(), body: f.body }); setMsg('Saved ✓'); load();
    } catch (e: any) { setMsg(e?.message || 'Failed'); }
  }
  const edit = (w: any) => setF({
    body: w.body || bodies[0]?.name || '', number: String(w.number), name: w.name || '',
    members: (w.members?.length ? w.members : [{ name: '', mobile: '' }]).map((m: any) => ({ name: m.name || '', mobile: m.mobile || '' })),
  });
  const exists = rows?.some((w) => String(w.number) === String(f.number) && (w.body || 'Gondia') === f.body);

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-slate-800 mt-2 mb-1">Wards</h1>
        <p className="text-sm text-slate-500 mb-4">Pick the <b>town / body</b> first (Gondia, Tirora, …), then add each ward (number + area) and its member(s). Ward numbers are per-town, so Gondia ward 1 and Tirora ward 1 are different wards. A member's mobile powers their call/WhatsApp contact button and the "Ward Member" badge — never shown as plain text.</p>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
          <select className={`${input} mb-2`} value={f.body} onChange={(e) => set('body', e.target.value)}>
            <option value="">Select town / body…</option>
            {bodies.map((b) => <option key={b.name} value={b.name}>{b.name}{b.taluka && b.taluka !== b.name ? ` · ${b.taluka}` : ''}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} type="number" placeholder="Ward no." value={f.number} onChange={(e) => set('number', e.target.value)} />
            <input className={input} placeholder="Area / name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-slate-500">Ward member(s)</div>
            {f.members.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input className={input} placeholder="Member name" value={m.name} onChange={(e) => setM(i, 'name', e.target.value)} />
                <input className={input} placeholder="Mobile" value={m.mobile} onChange={(e) => setM(i, 'mobile', e.target.value)} />
                {f.members.length > 1 && <button onClick={() => set('members', f.members.filter((_, j) => j !== i))} className="text-slate-400 px-2">×</button>}
              </div>
            ))}
            <button onClick={() => set('members', [...f.members, { name: '', mobile: '' }])} className="text-xs text-brand">＋ add another member</button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={save} className="rounded-lg bg-brand text-white text-sm font-medium px-5 py-2">{exists ? 'Update' : 'Add'} ward</button>
            {f.number && <button onClick={() => setF({ ...blank(), body: f.body })} className="text-sm text-slate-400">clear</button>}
            {msg && <span className="text-sm text-emerald-600">{msg}</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left"><tr>
              <th className="px-3 py-2 font-medium">Town</th><th className="px-3 py-2 font-medium">Ward</th><th className="px-3 py-2 font-medium">Area</th>
              <th className="px-3 py-2 font-medium">Members</th><th className="px-3 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(rows || []).map((w) => (
                <tr key={w._id || `${w.body}-${w.number}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600">{w.body || 'Gondia'}</td>
                  <td className="px-3 py-2 font-medium">{w.number}</td>
                  <td className="px-3 py-2 text-slate-600">{w.name || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{(w.members || []).map((m: any) => m.name).filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => edit(w)} className="text-brand text-xs hover:underline">edit</button></td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No wards yet — add the first above.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
