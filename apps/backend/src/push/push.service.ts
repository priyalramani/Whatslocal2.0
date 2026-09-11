import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { PushSubscription, PushSubscriptionDocument } from './push.schema';
import { User, UserDocument } from '../users/user.schema';

// The VAPID PUBLIC key is NOT secret — it's handed to every browser so it can
// subscribe. The PRIVATE key is only needed to SEND and lives in the box .env
// (VAPID_PRIVATE_KEY), never in the repo. Public falls back to the shipped
// default so subscription works in dev; sending needs BOTH keys set.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  || 'BBHrrr8x-hQVD65b10m73cfFF0yCATBbEEOy-SXvdI5z1WCQsJ98hY0KDZUSeD7aNOiiHGkfyusGoOIdnKNqpAc';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@whatslocal.in';

@Injectable()
export class PushService {
  private readonly canSend: boolean;
  constructor(
    @InjectModel(PushSubscription.name) private readonly subs: Model<PushSubscriptionDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {
    // Sending is enabled only when both keys are present.
    this.canSend = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (this.canSend) {
      try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); }
      catch { /* bad keys → leave sending effectively disabled */ }
    }
  }

  vapidPublicKey(): string { return VAPID_PUBLIC_KEY; }

  // Store / refresh a subscription. Keyed by endpoint → a device re-subscribing
  // updates its row instead of duplicating. `admin` is set ONLY when the caller
  // proved an admin token (verified in the controller). Silently ignores bad input.
  async subscribe(
    sub: any,
    meta: { visitor_id?: string; user_id?: string | null; admin?: boolean; role?: string; city?: string; ua?: string },
  ): Promise<{ ok: true }> {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { ok: true };
    await this.subs.findOneAndUpdate(
      { endpoint: sub.endpoint },
      {
        $set: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          visitor_id: meta.visitor_id || '',
          user_id: meta.user_id || null,
          admin: !!meta.admin,
          role: meta.role || '',
          city: meta.city || '',
          ua: (meta.ua || '').slice(0, 300),
        },
      },
      { upsert: true },
    );
    return { ok: true };
  }

  async unsubscribe(endpoint: string): Promise<{ ok: true }> {
    if (endpoint) await this.subs.deleteOne({ endpoint });
    return { ok: true };
  }

  // On login: attach this device's subscriptions to the now-known user.
  async linkUser(visitorId: string, userId: string): Promise<{ linked: number }> {
    if (!visitorId || !userId) return { linked: 0 };
    const r = await this.subs.updateMany(
      { visitor_id: visitorId, $or: [{ user_id: null }, { user_id: { $exists: false } }] },
      { $set: { user_id: userId } },
    );
    return { linked: (r as any).modifiedCount ?? 0 };
  }

  // Push a notification to EVERY device currently subscribed as an admin. Tight:
  // a subscription only counts if its user is STILL an active admin right now
  // (guards a demoted/removed admin, or a row that outlived a role change). Dead
  // endpoints (404/410) are pruned. Never throws — best-effort, fire-and-forget.
  async sendToAdmins(payload: { title: string; body: string; url?: string; tag?: string }): Promise<{ sent: number }> {
    if (!this.canSend) return { sent: 0 };
    const subs = await this.subs.find({ admin: true }).lean();
    if (!subs.length) return { sent: 0 };

    // Re-verify each subscription's user is a current, active admin.
    const ids = [...new Set(subs.map((s) => s.user_id).filter(Boolean) as string[])];
    let liveAdmins = new Set<string>();
    try {
      const rows = await this.users.find({ _id: { $in: ids }, role: 'admin', active: { $ne: false } }, { _id: 1 }).lean();
      liveAdmins = new Set(rows.map((u: any) => String(u._id)));
    } catch { /* if the check fails, send to none rather than over-send */ return { sent: 0 }; }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/admin/approvals',
      // UNIQUE tag per post → Android/Chrome shows each alert instead of
      // collapsing them onto one. requireInteraction keeps it on screen until the
      // admin acts (doesn't auto-dismiss); renotify re-alerts even if tags repeat.
      tag: payload.tag || `wl-approval-${Date.now()}`,
      requireInteraction: true,
      renotify: true,
    });
    // Urgency 'high' asks the push service to deliver promptly even under Android
    // Doze / battery optimisation; TTL keeps it retrying for a day if offline.
    const opts = { urgency: 'high' as const, TTL: 24 * 60 * 60 };
    let sent = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        if (!s.user_id || !liveAdmins.has(String(s.user_id))) return; // not a current admin → skip
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as any }, body, opts);
          sent += 1;
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) await this.subs.deleteOne({ endpoint: s.endpoint }); // gone
        }
      }),
    );
    return { sent };
  }

  // Send a TEST notification to the calling admin's OWN device(s). Scoped to this
  // user_id (admin subs only), so an admin can verify alerts work on demand
  // without waiting for a real post. Unique tag per test so repeats all show.
  async sendTestToUser(userId: string): Promise<{ sent: number }> {
    if (!this.canSend || !userId) return { sent: 0 };
    const subs = await this.subs.find({ user_id: userId, admin: true }).lean();
    if (!subs.length) return { sent: 0 };
    const body = JSON.stringify({
      title: 'Test alert ✅',
      body: 'Admin notifications are working on this device.',
      url: '/admin/approvals',
      tag: `wl-test-${Date.now()}`,
      renotify: true,
    });
    const opts = { urgency: 'high' as const, TTL: 60 };
    let sent = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as any }, body, opts);
          sent += 1;
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) await this.subs.deleteOne({ endpoint: s.endpoint });
        }
      }),
    );
    return { sent };
  }
}
