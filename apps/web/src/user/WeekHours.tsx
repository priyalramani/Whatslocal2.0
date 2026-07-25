import { useEffect, useState } from 'react';
import type { DaySchedule } from '@whatslocal/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DEFAULT_WEEK: DaySchedule[] = DAYS.map((d) => ({ day: d, open: d !== 'Sun', from: '09:00', to: '19:00' }));

// Simple per-day working hours. Sunday defaults to off; each open day has a
// from–to time (set a short range for a half day).
export function WeekHours({ value, onChange }: { value?: DaySchedule[]; onChange: (w: DaySchedule[]) => void }) {
  const week = value && value.length === 7 ? value : DEFAULT_WEEK;
  useEffect(() => { if (!value || value.length !== 7) onChange(DEFAULT_WEEK); }, []); // eslint-disable-line

  // After a time edit, offer to copy it to every day (the most common case).
  const [pending, setPending] = useState<{ i: number; field: 'from' | 'to'; value: string } | null>(null);

  const upd = (i: number, patch: Partial<DaySchedule>) =>
    onChange(week.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const onTime = (i: number, field: 'from' | 'to', value: string) => {
    upd(i, { [field]: value });
    setPending({ i, field, value });
  };

  // Copy the just-changed open/close time to all days' matching field.
  const applyAll = () => {
    if (pending) onChange(week.map((d) => ({ ...d, [pending.field]: pending.value })));
    setPending(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {week.map((d, i) => (
        <div key={d.day} className="flex items-center gap-2 px-3 py-2">
          <span className="w-9 text-sm font-medium text-slate-700">{d.day}</span>
          <button type="button" onClick={() => upd(i, { open: !d.open })}
            className={`text-[11px] rounded-full px-2.5 py-1 ${d.open ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-400'}`}>
            {d.open ? 'Open' : 'Closed'}
          </button>
          {d.open ? (
            <div className="flex items-center gap-1 ml-auto">
              <input type="time" value={d.from} onChange={(e) => onTime(i, 'from', e.target.value)}
                className="rounded-md border border-slate-200 px-1.5 py-1 text-xs" />
              <span className="text-slate-400 text-xs">–</span>
              <input type="time" value={d.to} onChange={(e) => onTime(i, 'to', e.target.value)}
                className="rounded-md border border-slate-200 px-1.5 py-1 text-xs" />
            </div>
          ) : <span className="ml-auto text-xs text-slate-300">Holiday</span>}
        </div>
      ))}

      {pending && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-3 py-2 text-xs">
          <span className="text-slate-600">
            Apply this {pending.field === 'from' ? 'opening' : 'closing'} time ({fmtTime(pending.value)}) to all days?
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={applyAll}
              className="rounded-lg bg-brand text-white px-3 py-1 hover:bg-brand-dark">All days</button>
            <button type="button" onClick={() => setPending(null)}
              className="rounded-lg border border-slate-300 text-slate-600 px-3 py-1 hover:bg-white">Only {week[pending.i].day}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// "09:00" → "9:00 AM"
export function fmtTime(t?: string): string {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return t || '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
