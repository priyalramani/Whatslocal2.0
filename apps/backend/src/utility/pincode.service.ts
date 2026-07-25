import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PinLookupResult } from '@whatslocal/types';
import { Pincode, PincodeDocument } from './pincode.schema';
import { resolvePin as resolveFromIndiaPost } from './pin';

// Pincodes a Gondia visitor is most likely to enter first — pre-warmed at boot
// so even the very FIRST user never waits on India Post. resolve() stores
// whatever India Post actually returns, so a wrong/nonexistent guess here is
// harmless (it just gets skipped). The owner can extend this list freely — e.g.
// the other Gondia-district taluka HQs. Every other pin fills in on first use.
const SEED_PINS = ['441601', '441614'];

@Injectable()
export class PincodeService implements OnModuleInit {
  private readonly log = new Logger('PincodeService');
  // In-process caches on top of Mongo: positives are permanent (a pin→district
  // mapping never changes); misses get a short TTL so a typo'd pin doesn't
  // re-hit the slow API on every keystroke-driven lookup.
  private readonly mem = new Map<string, PinLookupResult>();
  private readonly miss = new Map<string, number>();
  private readonly MISS_TTL = 10 * 60 * 1000;

  constructor(@InjectModel(Pincode.name) private readonly pins: Model<PincodeDocument>) {}

  async onModuleInit(): Promise<void> {
    void this.prewarm(); // background — never block or fail boot on India Post
  }
  private async prewarm(): Promise<void> {
    for (const pin of SEED_PINS) {
      try {
        if (this.mem.has(pin) || (await this.pins.exists({ pin }))) continue;
        const r = await this.resolve(pin);
        if (r) this.log.log(`pre-warmed ${pin} → ${r.district}, ${r.state}`);
      } catch { /* read-through will fill it on first real use */ }
    }
  }

  // Read-through: in-memory → Mongo → India Post (then persist). Returns null if
  // the pin can't be resolved (caller decides how to handle).
  async resolve(pin: string): Promise<PinLookupResult | null> {
    if (!/^[0-9]{6}$/.test(pin)) return null;

    const hit = this.mem.get(pin);
    if (hit) return hit;

    const doc = await this.pins.findOne({ pin }).lean();
    if (doc) {
      const r: PinLookupResult = { pin, city: doc.city, district: doc.district, state: doc.state, localities: doc.localities || [] };
      this.mem.set(pin, r);
      return r;
    }

    const missedAt = this.miss.get(pin);
    if (missedAt && Date.now() - missedAt < this.MISS_TTL) return null;

    const r = await resolveFromIndiaPost(pin);
    if (r && (r.district || r.state)) {
      await this.pins.updateOne(
        { pin },
        { $set: { pin, city: r.city, district: r.district, state: r.state, localities: r.localities || [] } },
        { upsert: true },
      ).catch(() => { /* cache write is best-effort */ });
      this.mem.set(pin, r);
      this.miss.delete(pin);
      return r;
    }
    this.miss.set(pin, Date.now());
    return null;
  }
}
