// One soft-ask card per session, shared across the notification opt-in (push),
// the reverse-posting nudge, and the install prompt — so a visitor never gets two
// bottom cards stacked in a single visit. Whichever fires first claims the slot;
// the install card (lowest priority) yields when the slot is already taken.
// Push + the reverse nudge only CLAIM the slot (their behaviour relative to each
// other is unchanged); the install card both claims AND checks.
const K = 'wl_soft_ask';
export function softAskClaimed(): boolean {
  try { return sessionStorage.getItem(K) === '1'; } catch { return false; }
}
export function claimSoftAsk(): void {
  try { sessionStorage.setItem(K, '1'); } catch { /* ignore */ }
}
