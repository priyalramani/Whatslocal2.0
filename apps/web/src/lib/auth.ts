import { api, setAdminToken, getAdminToken } from './api';

export interface AuthUser { id: string; username: string; role: string; name: string }

const USER_KEY = 'wl_admin_user';

export async function login(username: string, password: string): Promise<AuthUser> {
  const { token, user } = await api<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAdminToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  setAdminToken(null);
  localStorage.removeItem(USER_KEY);
}

export function currentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getAdminToken()) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export const isAdmin = () => currentUser()?.role === 'admin';
