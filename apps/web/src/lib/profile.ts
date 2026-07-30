import { api } from './api';
import { getVisitorId } from './analytics';

// Profile facts collected from the visitor. Works logged in OR anonymous — the
// value is keyed to this device's visitor id; the api() bearer (if any) also
// links it to the account.

// '' = we don't know yet → the app should prompt.
export const getGender = () =>
  api<{ gender: string }>(`/profile/gender?vid=${encodeURIComponent(getVisitorId())}`);

export const saveGender = (gender: string) =>
  api<{ ok: boolean; gender: string }>('/profile/gender', {
    method: 'POST',
    body: JSON.stringify({ visitor_id: getVisitorId(), gender }),
  });
