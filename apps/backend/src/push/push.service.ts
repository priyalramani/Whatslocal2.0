import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PushSubscription, PushSubscriptionDocument } from './push.schema';

// The VAPID PUBLIC key is NOT secret — it's handed to every browser so it can
// subscribe. The PRIVATE key is only needed to SEND (built later) and lives in
// the box .env (VAPID_PRIVATE_KEY), never in the repo. Falls back to the
// generated public key so subscription works without env config in dev.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  || 'BH9cZA3JcuuSpmkge4ZQTkRG4-P8UqKYoJB5VigrsNsMdFgyyKApDl9aaftyUjRvmd12zw7XLvrvKL-QyKiNQZs';

@Injectable()
export class PushService {
  constructor(
    @InjectModel(PushSubscription.name) private readonly subs: Model<PushSubscriptionDocument>,
  ) {}

  vapidPublicKey(): string { return VAPID_PUBLIC_KEY; }

  // Store / refresh a subscription. Keyed by endpoint → a device re-subscribing
  // updates its row instead of duplicating. Silently ignores malformed input.
  async subscribe(sub: any, meta: { visitor_id?: string; user_id?: string | null; city?: string; ua?: string }): Promise<{ ok: true }> {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { ok: true };
    await this.subs.findOneAndUpdate(
      { endpoint: sub.endpoint },
      {
        $set: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          visitor_id: meta.visitor_id || '',
          user_id: meta.user_id || null,
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

  // On login: attach this device's subscriptions to the now-known user, so the
  // send side can target them personally later (mirrors analytics identify).
  async linkUser(visitorId: string, userId: string): Promise<{ linked: number }> {
    if (!visitorId || !userId) return { linked: 0 };
    const r = await this.subs.updateMany(
      { visitor_id: visitorId, $or: [{ user_id: null }, { user_id: { $exists: false } }] },
      { $set: { user_id: userId } },
    );
    return { linked: (r as any).modifiedCount ?? 0 };
  }
}
