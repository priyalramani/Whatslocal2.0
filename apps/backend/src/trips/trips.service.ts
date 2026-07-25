import { Injectable, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trip, TripDocument } from './trip.schema';
import { CreateTripDto, RepostTripDto } from './dto';

const IST = 5.5 * 60 * 60 * 1000;
const esc = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Today in IST (YYYY-MM-DD) — a recurring operator's shown date rolls to this.
const istToday = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
// Recurring operators never expire — a sentinel far-future date keeps them out
// of every `expires_at` filter and out of the sweep.
const NEVER = new Date('2999-12-31T00:00:00.000Z');

// A trip stays live until the END of its window (+1h grace so a cab leaving at
// 15:00 is still callable at 15:30). No window given → end of that IST day.
// A recurring (daily commercial) operator doesn't expire at all.
function expiryOf(date: string, timeTo?: string, recurring?: boolean): Date {
  if (recurring) return NEVER;
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeTo || '') ? timeTo! : '23:59';
  return new Date(`${date}T${hhmm}:00+05:30`);
}

@Injectable()
export class TripsService implements OnModuleInit {
  constructor(@InjectModel(Trip.name) private readonly trips: Model<TripDocument>) {}

  // Expired trips were only ever FILTERED OUT of search — the documents stayed
  // `active: true`, so anywhere that didn't repeat the expiry filter (the
  // operator's own list, admin, anything added later) still treated them as
  // live. Retire them properly instead: sweep on boot, then hourly.
  onModuleInit() {
    const sweep = () => this.deactivateExpired().catch(() => { /* best effort */ });
    setTimeout(sweep, 20_000).unref?.();
    // Every 10 min: a trip's window can end at any minute, and an operator
    // checking "My trips" right after their run should already see it retired.
    setInterval(sweep, 10 * 60 * 1000).unref?.();
  }

  async deactivateExpired(): Promise<number> {
    const r = await this.trips.updateMany(
      // recurring operators carry the NEVER sentinel, so `$lte: now` never
      // matches them — but exclude explicitly too, so intent is on the page.
      { active: true, recurring: { $ne: true }, expires_at: { $lte: new Date() } },
      { $set: { active: false } },
    );
    return r.modifiedCount || 0;
  }

  private pub(d: any) {
    return {
      _id: String(d._id),
      from_city: d.from_city, to_city: d.to_city, via: d.via || '',
      // A recurring operator runs every day, so its shown date is always today —
      // it should never read as a stale past date.
      date: d.recurring ? istToday() : d.date,
      time_from: d.time_from || '', time_to: d.time_to || '',
      vehicle: d.vehicle || '', seats: d.seats ?? null, fare: d.fare ?? null,
      one_way: d.one_way !== false, note: d.note || '',
      operator_name: d.operator_name, mobile: d.mobile, whatsapp: d.whatsapp || '',
      city: d.city || '', createdAt: d.createdAt,
      recurring: !!d.recurring,
      // When this trip drops off the board — the one thing that makes a cab post
      // different from every other listing. Null for recurring (no expiry).
      expires_at: d.recurring ? null : d.expires_at,
    };
  }

  async create(dto: CreateTripDto, user: { id: string; mobile?: string }) {
    const recurring = !!dto.recurring;
    const expires = recurring
      ? NEVER
      : new Date(expiryOf(dto.date, dto.time_to).getTime() + 60 * 60 * 1000); // +1h grace
    const doc = await this.trips.create({
      ...dto,
      one_way: dto.one_way !== false,
      recurring,
      expires_at: expires,
      posted_by_user_id: user.id,
      posted_by_mobile: user.mobile || '',
      active: true,
    });
    return { _id: String(doc._id) };
  }

  // Live trips only, soonest first. Route/date are optional filters — with none,
  // it's "everything leaving soon", which is what an empty search should show.
  async search(opts: { from?: string; to?: string; date?: string; city?: string }) {
    const filter: any = { active: true, expires_at: { $gt: new Date() } };
    if (opts.from) filter.from_city = new RegExp('^' + esc(opts.from) + '$', 'i');
    if (opts.to) filter.to_city = new RegExp('^' + esc(opts.to) + '$', 'i');
    // A recurring operator runs EVERY day, so a date filter must still surface
    // it — match its stored date OR the recurring flag.
    if (opts.date) filter.$or = [{ date: opts.date }, { recurring: true }];
    // Recurring operators lead (they're always available), then soonest dated.
    const rows = await this.trips.find(filter).sort({ recurring: -1, date: 1, time_from: 1, createdAt: -1 }).limit(80).lean();
    return { results: rows.map((r) => this.pub(r)) };
  }

  // Distinct live routes — powers the From/To pickers with real options only.
  async routes() {
    const rows: any[] = await this.trips.aggregate([
      { $match: { active: true, expires_at: { $gt: new Date() } } },
      { $group: { _id: { f: '$from_city', t: '$to_city' }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 60 },
    ]);
    const from = [...new Set(rows.map((r) => r._id.f))];
    const to = [...new Set(rows.map((r) => r._id.t))];
    return { from, to, routes: rows.map((r) => ({ from: r._id.f, to: r._id.t, count: r.n })) };
  }

  async mine(userId: string) {
    const rows = await this.trips.find({ posted_by_user_id: userId }).sort({ createdAt: -1 }).limit(40).lean();
    return { results: rows.map((r) => ({ ...this.pub(r), expired: new Date(r.expires_at) <= new Date(), active: r.active })) };
  }

  // Repeat yesterday's run in one tap — the retention feature for operators.
  async repost(id: string, dto: RepostTripDto, userId: string) {
    const src: any = await this.trips.findById(id).lean();
    if (!src) throw new NotFoundException('Trip not found');
    if (String(src.posted_by_user_id) !== String(userId)) throw new ForbiddenException('Not your trip');
    const time_from = dto.time_from || src.time_from;
    const time_to = dto.time_to || src.time_to;
    const doc = await this.trips.create({
      from_city: src.from_city, to_city: src.to_city, via: src.via,
      date: dto.date, time_from, time_to,
      expires_at: new Date(expiryOf(dto.date, time_to).getTime() + 60 * 60 * 1000),
      vehicle: src.vehicle, seats: src.seats, fare: src.fare, one_way: src.one_way, note: src.note,
      operator_name: src.operator_name, mobile: src.mobile, whatsapp: src.whatsapp,
      posted_by_user_id: userId, posted_by_mobile: src.posted_by_mobile,
      active: true, city: src.city,
    });
    return { _id: String(doc._id) };
  }

  async setActive(id: string, active: boolean, userId: string) {
    const t: any = await this.trips.findById(id).lean();
    if (!t) throw new NotFoundException('Trip not found');
    if (String(t.posted_by_user_id) !== String(userId)) throw new ForbiddenException('Not your trip');
    await this.trips.findByIdAndUpdate(id, { active });
    return { _id: id, active };
  }

  // ===== Admin =====
  // Cab sharing is managed on its own screen, not through the business-listing
  // editor: the only fields that matter here are route, when, vehicle and phone.

  async adminList(includeExpired = false) {
    // Retire anything that lapsed since the last sweep, so what admin sees as
    // "live" really is live rather than up-to-10-minutes stale.
    await this.deactivateExpired().catch(() => { /* best effort */ });
    const filter: any = includeExpired ? {} : { expires_at: { $gt: new Date() } };
    const rows = await this.trips.find(filter).sort({ recurring: -1, date: -1, time_from: 1, createdAt: -1 }).limit(300).lean();
    const now = Date.now();
    return {
      results: rows.map((r: any) => ({
        ...this.pub(r),
        active: r.active !== false,
        expired: !r.recurring && new Date(r.expires_at).getTime() <= now,
        posted_by_mobile: r.posted_by_mobile || '',
      })),
    };
  }

  async adminCreate(dto: CreateTripDto, adminId: string) {
    const recurring = !!dto.recurring;
    const doc = await this.trips.create({
      ...dto,
      one_way: dto.one_way !== false,
      recurring,
      expires_at: recurring ? NEVER : new Date(expiryOf(dto.date, dto.time_to).getTime() + 60 * 60 * 1000),
      posted_by_user_id: adminId,
      posted_by_mobile: '',
      active: true,
    });
    return { _id: String(doc._id) };
  }

  async adminUpdate(id: string, dto: Partial<CreateTripDto>) {
    const src: any = await this.trips.findById(id).lean();
    if (!src) throw new NotFoundException('Trip not found');
    const patch: any = { ...dto };
    // Recurring can be toggled on the edit; recompute expiry either way so the
    // flag and the expiry never disagree.
    const recurring = dto.recurring !== undefined ? !!dto.recurring : !!src.recurring;
    patch.recurring = recurring;
    if (recurring) {
      patch.expires_at = NEVER;
    } else {
      const date = dto.date || src.date;
      const timeTo = dto.time_to !== undefined ? dto.time_to : src.time_to;
      patch.expires_at = new Date(expiryOf(date, timeTo).getTime() + 60 * 60 * 1000);
    }
    const d: any = await this.trips.findByIdAndUpdate(id, patch, { new: true }).lean();
    return this.pub(d);
  }

  async adminSetActive(id: string, active: boolean) {
    const d: any = await this.trips.findByIdAndUpdate(id, { active }, { new: true }).lean();
    if (!d) throw new NotFoundException('Trip not found');
    return { _id: id, active: d.active !== false };
  }

  async adminRemove(id: string) {
    const r = await this.trips.deleteOne({ _id: id });
    if (!r.deletedCount) throw new NotFoundException('Trip not found');
    return { _id: id, deleted: true };
  }

  // Today's IST date — the default the post form and search open on.
  static today(): string { return new Date(Date.now() + IST).toISOString().slice(0, 10); }
}
