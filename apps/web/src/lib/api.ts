// API wrapper. Two token kinds live in localStorage:
//   wl_admin_token — admin session (admin pages)
//   wl_user_token  — general user (OTP) session (public app)
// Admin/analytics endpoints use the admin token; everything else uses the user token.
const ADMIN_KEY = 'wl_admin_token';
const USER_KEY = 'wl_user_token';

export const getAdminToken = () => localStorage.getItem(ADMIN_KEY);
export const setAdminToken = (t: string | null) =>
  t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY);
export const getUserToken = () => localStorage.getItem(USER_KEY);
export const setUserToken = (t: string | null) =>
  t ? localStorage.setItem(USER_KEY, t) : localStorage.removeItem(USER_KEY);

function tokenForPath(path: string): string | null {
  if (path.startsWith('/admin') || path.startsWith('/analytics')) return getAdminToken();
  return getUserToken();
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = tokenForPath(path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/v1${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = res.statusText;
    let code = '';
    try { const j = await res.json(); msg = j.message || msg; code = j.code || ''; } catch { /* ignore */ }
    const err: any = new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    err.status = res.status; err.code = code;
    throw err;
  }
  return res.json() as Promise<T>;
}

// Photo upload. Can't go through api() — it forces JSON Content-Type, which
// breaks multipart (the browser must set the boundary itself). Works for both
// the public app (user token) and admin posting (admin token) — the endpoint
// accepts any valid JWT. Returns the photo key + ready-to-use image paths.
export async function uploadPhoto(file: File): Promise<{ key: string; view: string; thumb: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const headers: Record<string, string> = {};
  const token = getUserToken() || getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/v1/listings/upload', { method: 'POST', body: fd, headers });
  if (!res.ok) {
    let msg = res.statusText;
    let code = '';
    try { const j = await res.json(); msg = j.message || msg; code = j.code || ''; } catch { /* ignore */ }
    const err: any = new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    err.status = res.status; err.code = code;
    throw err;
  }
  return res.json() as Promise<{ key: string; view: string; thumb: string }>;
}

// Build a media URL from a stored photo key. view ≈1280px (detail), thumb ≈480px (tiles).
export function mediaUrl(key: string, size: 'view' | 'thumb' = 'view'): string {
  return `/media/${key}/${size}.jpg`;
}
