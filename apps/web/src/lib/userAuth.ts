import { api, setUserToken, getUserToken } from './api';
import { identify } from './analytics';
import { linkPushUser } from './push';
import { msg91Configured, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp } from './msg91';

export interface UserSession { id: string; mobile: string; role: string }
const SESS_KEY = 'wl_user_session';

// Send an OTP. With MSG91 configured the widget sends it; otherwise the backend
// demo flow (number "receives" 1234).
export const requestOtp = (mobile: string): Promise<unknown> =>
  msg91Configured
    ? widgetSendOtp(mobile)
    : api<{ ok: true }>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ mobile }) });

// OTP login → stores user session token. With MSG91 we verify the OTP via the
// widget to get a signed access-token, then the backend confirms it with MSG91
// (and reads the verified number from it) before issuing our session JWT.
export async function loginWithOtp(mobile: string, otp: string): Promise<UserSession> {
  const { token, user } = msg91Configured
    ? await api<{ token: string; user: UserSession }>('/auth/otp/widget-verify', {
        method: 'POST', body: JSON.stringify({ accessToken: await widgetVerifyOtp(otp) }),
      })
    : await api<{ token: string; user: UserSession }>('/auth/otp/verify', {
        method: 'POST', body: JSON.stringify({ mobile, otp }),
      });
  setUserToken(token);
  localStorage.setItem(SESS_KEY, JSON.stringify(user));
  // Link this device's anonymous analytics history + any push subscription to
  // the now-known user. Fire-and-forget — never block or fail login on it.
  void identify();
  void linkPushUser();
  return user;
}

// Verify a DIFFERENT contact number → returns a token to attach when posting.
export const verifyNumber = (mobile: string, otp: string) =>
  msg91Configured
    ? widgetVerifyOtp(otp).then((accessToken) =>
        api<{ mobile_token: string; mobile: string }>('/auth/number/widget-verify', {
          method: 'POST', body: JSON.stringify({ accessToken }),
        }))
    : api<{ mobile_token: string; mobile: string }>('/auth/number/verify', {
        method: 'POST', body: JSON.stringify({ mobile, otp }),
      });

// The logged-in user's profile incl. their stored display name (Ward Complaints).
export const getMyProfile = () => api<{ id: string; mobile: string; role: string; name: string }>('/auth/me');
// Set the display name once (asked right after login when missing).
export const setMyName = (name: string) => api<{ name: string }>('/auth/me/name', { method: 'POST', body: JSON.stringify({ name }) });

export function currentSession(): UserSession | null {
  const raw = localStorage.getItem(SESS_KEY);
  if (!raw || !getUserToken()) return null;
  try { return JSON.parse(raw) as UserSession; } catch { return null; }
}

export function userLogout() {
  setUserToken(null);
  localStorage.removeItem(SESS_KEY);
}
