import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminTrips, adminCreateTrip, adminUpdateTrip, adminSetTripActive, adminDeleteTrip,
  istToday, VEHICLES, type AdminTrip,
} from '../lib/trips';

// CAB SHARING — its own admin section, deliberately NOT the business-listing
// editor. A cab post has none of a shop's fields (no categories, photos, hours,
// address); it has a route, a departure window and a phone, and it dies on a
// known date. So: a short form, and expiry shown on every row.

const EMPTY = {
  from_city: '', to_city: '', via: '', date: istToday(), time_from: '', time_to: '',
  vehicle: 'Dzire', seats: '', fare: '', note: '', operator_name: '', mobile: '', whatsapp: '',
  city: 'Gondia', recurring: false,
};

const fmtExpiry = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Read it the way Gondia reads it.
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

export function AdminCabs() {
  const [rows, setRows] = useState<AdminTrip[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<any | null>(null);   // null = closed
  const [editId, setEditId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => adminTrips(expired).then((r) => setRows(r.results)).catch((e) => setErr(e?.message || 'Failed to load'));
  useEffect(() => { setRows(null); load(); }, [expired]); // eslint-disable-line

  const openNew = () => { setEditId(''); setForm({ ...EMPTY }); setErr(''); };
  const openEdit = (t: AdminTrip) => {
    setEditId(t._id); setErr('');
    setForm({
      from_city: t.from_city, to_city: t.to_city, via: t.via || '', date: t.date,
      time_from: t.time_from || '', time_to: t.time_to || '', vehicle: t.vehicle || 'Dzire',
      seats: t.seats ?? '', fare: t.fare ?? '', note: t.note || '',
      operator_name: t.operator_name || '', mobile: t.mobile || '', whatsapp: t.whatsapp || '',
      city: t.city || 'Gondia', recurring: !!t.recurring,
    });
  };
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.from_city.trim() || !form.to_city.trim()) { setErr('Enter both cities'); return; }
    // At least one reachable number — same rule as the public post form.
    if (!/^\d{10}$/.test(form.mobile) && !/^\d{10}$/.test(form.whatsapp)) {
      setErr('Enter a call or WhatsApp number'); return;
    }
    setBusy(true); setErr('');
    const payload = {
      from_city: form.from_city.trim(), to_city: form.to_city.trim(), via: form.via.trim() || undefined,
      date: form.date, time_from: form.time_from || undefined, time_to: form.time_to || undefined,
      vehicle: form.vehicle, seats: form.seats ? Number(form.seats) : undefined,
      fare: form.fare ? Number(form.fare) : undefined, note: form.note.trim() || undefined,
      operator_name: form.operator_name.trim() || undefined,
      mobile: form.mobile || form.whatsapp, whatsapp: form.whatsapp || undefined, city: form.city,
      recurring: !!form.recurring,
    };
    try {
      if (editId) await adminUpdateTrip(editId, payload);
      else await adminCreateTrip(payload);
      setForm(null); setEditId(''); load();
    } catch (e: any) { setErr(e?.message || 'Could not save'); }
    finally { setBusy(false); }
  }

  async function remove(t: AdminTrip) {
    if (!confirm(`Delete the ${t.from_city} → ${t.to_city} trip on ${t.date}?`)) return;
    try { await adminDeleteTrip(t._id); load(); } catch (e: any) { setErr(e?.message || 'Could not delete'); }
  }
  async function toggle(t: AdminTrip) {
    try { await adminSetTripActive(t._id, !t.active); load(); } catch (e: any) { setErr(e?.message || 'Could not update'); }
  }

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';
  const lbl = 'block text-[11px] font-medium text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Link to="/admin" className="text-sm text-brand hover:underline">← Dashboard</Link>
        <div className="flex items-center justify-between mt-2 mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              🚕 Cab Sharing {rows && <span className="text-sm font-normal text-slate-500">· {rows.length} trips</span>}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              One-way taxi seats from travel operators. Every trip expires on its own — an hour after the
              departure window ends, or at the end of that day if no window is given.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={expired} onChange={(e) => setExpired(e.target.checked)} />
              Show expired
            </label>
            <button onClick={openNew} className="rounded-lg bg-brand text-white text-sm font-medium px-3 py-1.5">＋ Add trip</button>
          </div>
        </div>

        {err && !form && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{err}</div>}
        {!rows && !err && <div className="text-slate-500">Loading…</div>}

        {rows && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t._id} className={`hover:bg-slate-50 ${t.expired || !t.active ? 'opacity-55' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{t.from_city} → {t.to_city}</div>
                      {t.via && <div className="text-[11px] text-slate-400">via {t.via}</div>}
                      {t.operator_name && <div className="text-[11px] text-slate-400">{t.operator_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.recurring
                        ? <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">🔁 Every day</span>
                        : t.date}
                      <div className="text-[11px] text-slate-400">{[t.time_from, t.time_to].filter(Boolean).join(' – ') || 'any time'}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.vehicle || '—'}
                      <div className="text-[11px] text-slate-400">
                        {t.seats ? `${t.seats} seats` : ''}{t.seats && t.fare ? ' · ' : ''}{t.fare ? `₹${t.fare}` : 'call for fare'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{t.mobile}</td>
                    <td className="px-3 py-2">
                      <span className={t.expired ? 'text-slate-400' : 'text-slate-700'}>
                        {t.recurring ? 'never' : fmtExpiry(t.expires_at)}
                      </span>
                      <div className="text-[11px]">
                        {t.expired ? <span className="text-slate-400">expired</span>
                          : !t.active ? <span className="text-amber-600">hidden</span>
                            : <span className="text-emerald-600">live</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(t)} className="text-brand hover:underline text-xs mr-2">Edit</button>
                      <button onClick={() => toggle(t)} className="text-slate-500 hover:underline text-xs mr-2">
                        {t.active ? 'Hide' : 'Show'}
                      </button>
                      <button onClick={() => remove(t)} className="text-red-600 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    No {expired ? '' : 'live '}trips.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-800 mb-3">{editId ? 'Edit trip' : 'Add trip'}</div>
            {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}
            <div className="grid grid-cols-2 gap-3">
              <label><span className={lbl}>From *</span>
                <input className={inp} value={form.from_city} onChange={(e) => set('from_city', e.target.value)} /></label>
              <label><span className={lbl}>To *</span>
                <input className={inp} value={form.to_city} onChange={(e) => set('to_city', e.target.value)} /></label>
              <label className="col-span-2"><span className={lbl}>Via (optional)</span>
                <input className={inp} value={form.via} onChange={(e) => set('via', e.target.value)} /></label>
              {/* A daily commercial operator (Jay Appaji, Banewar) — never
                  expires, no per-day date. This is what puts them in Cab Sharing
                  instead of a one-off dated seat. */}
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.recurring} onChange={(e) => set('recurring', e.target.checked)} />
                🔁 Runs every day (regular operator — never expires)
              </label>
              {!form.recurring && (
                <label><span className={lbl}>Date *</span>
                  <input className={inp} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label>
              )}
              <label><span className={lbl}>Vehicle</span>
                <select className={inp} value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
                  {VEHICLES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select></label>
              <label><span className={lbl}>Departs from</span>
                <input className={inp} type="time" value={form.time_from} onChange={(e) => set('time_from', e.target.value)} /></label>
              <label><span className={lbl}>…until (sets expiry)</span>
                <input className={inp} type="time" value={form.time_to} onChange={(e) => set('time_to', e.target.value)} /></label>
              <label><span className={lbl}>Seats</span>
                <input className={inp} inputMode="numeric" value={form.seats}
                  onChange={(e) => set('seats', e.target.value.replace(/\D/g, ''))} /></label>
              <label><span className={lbl}>Fare ₹ (blank = call for fare)</span>
                <input className={inp} inputMode="numeric" value={form.fare}
                  onChange={(e) => set('fare', e.target.value.replace(/\D/g, ''))} /></label>
              <label><span className={lbl}>Call number</span>
                <input className={inp} inputMode="numeric" value={form.mobile}
                  onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
              <label><span className={lbl}>WhatsApp (if different)</span>
                <input className={inp} inputMode="numeric" value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
              <label className="col-span-2"><span className={lbl}>Operator / travels name</span>
                <input className={inp} value={form.operator_name} onChange={(e) => set('operator_name', e.target.value)} /></label>
              <label className="col-span-2"><span className={lbl}>Note</span>
                <input className={inp} value={form.note} onChange={(e) => set('note', e.target.value)} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setForm(null)} className="rounded-lg border border-slate-300 text-slate-600 text-sm px-4 py-2">Cancel</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
                {busy ? '…' : editId ? 'Save' : 'Add trip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
