import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/user.schema';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  name: string;
  mobile?: string;
}

const DEFAULT_OTP = process.env.DEFAULT_OTP || '1234';
// Normalize Indian numbers to a bare 10-digit key (strip +91/0).
function normMobile(m: string): string {
  return String(m || '').replace(/\D/g, '').replace(/^(?:91)?0?(\d{10})$/, '$1');
}
// Indian mobiles are 10 digits starting 6–9 (excludes unix timestamps etc.).
const isMobile = (s: string) => /^[6-9]\d{9}$/.test(s);

// Decode a JWT payload (no signature check — authenticity is established by the
// MSG91 verifyAccessToken call; this only reads the verified number out of it).
function decodeJwtPayload(token: string): any {
  try {
    const seg = String(token).split('.')[1];
    if (!seg) return null;
    return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return null; }
}
// Find the verified Indian mobile in an MSG91 response / access-token payload.
// Prefers obvious identifier keys, then scans (skipping time claims).
function pickMobile(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of ['mobile', 'identifier', 'number', 'phone', 'msisdn']) {
    const m = normMobile(obj[k]); if (isMobile(m)) return m;
  }
  const SKIP = new Set(['iat', 'exp', 'nbf', 'timestamp', 'time']);
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number') { const m = normMobile(String(v)); if (isMobile(m)) return m; }
    else if (v && typeof v === 'object') { const m = pickMobile(v); if (m) return m; }
  }
  return '';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const u = await this.users.findOne({ username: String(username || '').toLowerCase().trim() });
    if (!u || !u.active) throw new UnauthorizedException('Invalid credentials.');
    const ok = await bcrypt.compare(String(password || ''), u.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid credentials.');

    const user: AuthUser = { id: String(u._id), username: u.username, role: u.role, name: u.name };
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { token, user };
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync(token);
      return {
        id: payload.sub, username: payload.username, role: payload.role,
        name: payload.name || '', mobile: payload.mobile || '',
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  // ---- OTP ----
  // Two paths: the MSG91 widget (real OTP — verification happens client-side and
  // we confirm the returned access-token here), or a DEFAULT_OTP demo fallback
  // when MSG91 isn't configured (local/dev).

  // Demo send is a no-op (the widget sends in prod). Kept for the fallback path.
  async requestOtp(mobile: string): Promise<{ ok: true }> {
    void normMobile(mobile);
    return { ok: true };
  }

  // Upsert a 'user' by mobile and issue our session JWT (carries the mobile).
  private async sessionForMobile(m: string): Promise<{ token: string; user: AuthUser }> {
    const u = await this.users.findOneAndUpdate(
      { username: m },
      { $set: { username: m, mobile: m, role: 'user', active: true }, $setOnInsert: { name: '' } },
      { upsert: true, new: true },
    );
    const user: AuthUser = { id: String(u!._id), username: u!.username, role: u!.role, name: u!.name, mobile: m };
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username, role: 'user', mobile: m });
    return { token, user };
  }
  // Short-lived proof that `m` was OTP-verified (for posting on its behalf).
  private mobileToken(m: string): Promise<string> {
    return this.jwt.signAsync({ mobile: m, purpose: 'number' }, { expiresIn: '30m' });
  }

  // Demo login (fallback): every number "receives" DEFAULT_OTP.
  async loginOtp(mobile: string, otp: string): Promise<{ token: string; user: AuthUser }> {
    const m = normMobile(mobile);
    if (!/^\d{10}$/.test(m)) throw new UnauthorizedException('Invalid mobile number.');
    if (String(otp) !== DEFAULT_OTP) throw new UnauthorizedException('Invalid OTP.');
    return this.sessionForMobile(m);
  }

  // Demo number-verify (fallback).
  async verifyNumber(mobile: string, otp: string): Promise<{ mobile_token: string; mobile: string }> {
    const m = normMobile(mobile);
    if (!/^\d{10}$/.test(m)) throw new UnauthorizedException('Invalid mobile number.');
    if (String(otp) !== DEFAULT_OTP) throw new UnauthorizedException('Invalid OTP.');
    return { mobile_token: await this.mobileToken(m), mobile: m };
  }

  // Confirm an MSG91 widget access-token server-side and return the VERIFIED
  // mobile (read from MSG91 / the signed token — never trusted from the client,
  // so a user can't verify one number and claim another).
  private async verifyWidgetToken(accessToken: string): Promise<string> {
    const authkey = process.env.MSG91_AUTH_KEY;
    if (!authkey) throw new UnauthorizedException('OTP service not configured.');
    if (!accessToken) throw new UnauthorizedException('Missing access token.');
    let data: any = {};
    try {
      const r = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authkey, 'access-token': accessToken }),
      });
      data = await r.json().catch(() => ({}));
      if (!r.ok || data?.type === 'error') throw new Error(data?.message || 'verify failed');
    } catch {
      throw new UnauthorizedException('OTP verification failed.');
    }
    const m = pickMobile(data) || pickMobile(decodeJwtPayload(accessToken));
    if (!isMobile(m)) throw new UnauthorizedException('Could not read the verified number.');
    return m;
  }

  // Real login via the MSG91 widget access-token.
  async loginWidget(accessToken: string): Promise<{ token: string; user: AuthUser }> {
    return this.sessionForMobile(await this.verifyWidgetToken(accessToken));
  }
  // Real number-verify via the MSG91 widget access-token.
  async verifyNumberWidget(accessToken: string): Promise<{ mobile_token: string; mobile: string }> {
    const m = await this.verifyWidgetToken(accessToken);
    return { mobile_token: await this.mobileToken(m), mobile: m };
  }

  // Used by listing-create to confirm a contact number was verified.
  async checkNumberToken(token: string, mobile: string): Promise<boolean> {
    try {
      const p = await this.jwt.verifyAsync(token);
      return p?.purpose === 'number' && normMobile(p.mobile) === normMobile(mobile);
    } catch {
      return false;
    }
  }

  // ---- moderation helpers (used by listings/reports) ----
  async isBlocked(userId: string): Promise<boolean> {
    if (!userId) return false;
    const u = await this.users.findById(userId, { blocked: 1 }).lean();
    return !!(u as any)?.blocked;
  }
  async setBlocked(userId: string, blocked: boolean): Promise<{ mobile: string }> {
    const u = await this.users.findByIdAndUpdate(userId, { blocked }, { new: true }).lean();
    return { mobile: (u as any)?.mobile || '' };
  }
  // Set a user's display name (Ward Complaints collect + show a name). Trimmed,
  // only overwrites when a non-empty value is given.
  async setName(userId: string, name: string): Promise<void> {
    const n = String(name || '').trim().slice(0, 60);
    if (userId && n) await this.users.findByIdAndUpdate(userId, { name: n });
  }
  // The user's stored display name (the JWT doesn't carry it — read from DB).
  async myName(userId: string): Promise<string> {
    if (!userId) return '';
    const u = await this.users.findById(userId, { name: 1 }).lean();
    return (u as any)?.name || '';
  }
  // mobile + blocked (+ name) for a set of user ids (admin views / complaints).
  async briefByIds(ids: string[]): Promise<Map<string, { mobile: string; blocked: boolean; name: string }>> {
    const valid = ids.filter(Boolean);
    if (!valid.length) return new Map();
    const us = await this.users.find({ _id: { $in: valid } }, { mobile: 1, blocked: 1, name: 1 }).lean();
    return new Map(us.map((u: any) => [String(u._id), { mobile: u.mobile || '', blocked: !!u.blocked, name: u.name || '' }]));
  }

  // Count of registered public users (OTP sign-ups; excludes admin accounts).
  async countUsers(): Promise<number> {
    return this.users.countDocuments({ role: 'user' });
  }

  // Registered public users with registration date (newest first) — for the
  // admin "Registered users" list. `created_at` comes from schema timestamps.
  async listUsers(): Promise<{ id: string; mobile: string; blocked: boolean; created_at: string }[]> {
    const us = await this.users
      .find({ role: 'user' }, { mobile: 1, blocked: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();
    return us.map((u: any) => ({
      id: String(u._id),
      mobile: u.mobile || '',
      blocked: !!u.blocked,
      created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    }));
  }

  static normalizeMobile = normMobile;
}
