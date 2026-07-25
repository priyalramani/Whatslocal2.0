import { useT } from '../../lib/i18n';
import type { WardMember } from '../../lib/complaints';

// Ward member(s) shown by NAME only — the call / WhatsApp / copy actions are
// intentionally hidden (numbers are never exposed here).
export function MemberContact({ members }: { members: WardMember[] }) {
  const { t } = useT();
  const valid = (members || []).filter((m) => m.name || m.mobile);
  if (!valid.length) return null;
  return (
    <div className="space-y-2">
      {valid.map((m, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 px-3 py-2">
          <div className="text-[10px] text-slate-400">{t('cmp.wardMember')}</div>
          <div className="font-medium text-slate-800 text-sm truncate">{m.name || '—'}</div>
        </div>
      ))}
    </div>
  );
}
