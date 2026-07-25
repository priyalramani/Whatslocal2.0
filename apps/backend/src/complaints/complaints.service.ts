import { Injectable, OnModuleInit, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Ward, WardDocument, Complaint, ComplaintDocument,
  ComplaintComment, ComplaintCommentDocument, Agency, AgencyDocument,
  Body, BodyDocument,
} from './schemas';
import { AuthService } from '../auth/auth.service';

type Requester = { id: string; role: string; mobile?: string };
const norm10 = (m?: string) => String(m || '').replace(/\D/g, '').slice(-10);
// Statuses a complaint must be in to appear publicly (not awaiting review / rejected).
const HIDDEN = ['pending', 'rejected'];
// "Open" = still needs action (for the ward's open-count).
const OPEN_LIKE = ['open', 'in_progress', 'on_hold', 'scheduled', 'escalated', 'legal', 'need_info', 'forwarded'];

@Injectable()
export class ComplaintsService implements OnModuleInit {
  constructor(
    @InjectModel(Ward.name) private readonly wards: Model<WardDocument>,
    @InjectModel(Complaint.name) private readonly complaints: Model<ComplaintDocument>,
    @InjectModel(ComplaintComment.name) private readonly comments: Model<ComplaintCommentDocument>,
    @InjectModel(Agency.name) private readonly agencies: Model<AgencyDocument>,
    @InjectModel(Body.name) private readonly bodies: Model<BodyDocument>,
    private readonly auth: AuthService,
  ) {}

  async onModuleInit() {
    if (await this.agencies.countDocuments() === 0) {
      const seed = [
        { name: 'MSEDCL (Electricity)', helpline: '1912', order: 1 },
        { name: 'Police', helpline: '100', order: 2 },
        { name: 'PWD (Roads/Highways)', helpline: '', order: 3 },
        { name: 'Maharashtra Jeevan Pradhikaran (Water)', helpline: '', order: 4 },
        { name: 'Railways', helpline: '139', order: 5 },
        { name: 'Revenue / Tehsildar', helpline: '', order: 6 },
        { name: 'Forest Department', helpline: '1926', order: 7 },
      ];
      await this.agencies.insertMany(seed).catch(() => {});
    }
    // Seed the 8 Gondia-district taluka towns (municipal bodies) once. Only
    // Gondia's pincodes are known for sure; the rest can be filled by the admin.
    if (await this.bodies.countDocuments() === 0) {
      const towns = [
        { name: 'Gondia', taluka: 'Gondia', pincodes: ['441601', '441614'] },
        { name: 'Tirora', taluka: 'Tirora', pincodes: [] as string[] },
        { name: 'Goregaon', taluka: 'Goregaon', pincodes: [] as string[] },
        { name: 'Amgaon', taluka: 'Amgaon', pincodes: [] as string[] },
        { name: 'Salekasa', taluka: 'Salekasa', pincodes: [] as string[] },
        { name: 'Deori', taluka: 'Deori', pincodes: [] as string[] },
        { name: 'Arjuni Morgaon', taluka: 'Arjuni Morgaon', pincodes: [] as string[] },
        { name: 'Sadak Arjuni', taluka: 'Sadak Arjuni', pincodes: [] as string[] },
      ];
      await this.bodies.insertMany(towns.map((t) => ({ ...t, type: 'municipal', city: 'Gondia', active: true }))).catch(() => {});
    }
    // Backfill wards/complaints that predate the body field → the Gondia town.
    await this.wards.updateMany({ body: { $in: [null, ''] } }, { $set: { body: 'Gondia', taluka: 'Gondia', body_type: 'municipal' } }).catch(() => {});
    await this.complaints.updateMany({ body: { $in: [null, ''] } }, { $set: { body: 'Gondia', taluka: 'Gondia' } }).catch(() => {});
  }

  // ---- name (Ward Complaints show a name, decision #1) --------------------
  // Resolve the display name: prefer the just-typed one (persist it), else the
  // stored profile name. Required — no name, no post.
  private async resolveName(userId: string, typed?: string): Promise<string> {
    const t = String(typed || '').trim();
    if (t) { await this.auth.setName(userId, t); return t; }
    const b = (await this.auth.briefByIds([userId])).get(String(userId));
    const stored = b?.name?.trim() || '';
    if (!stored) throw new BadRequestException('Please enter your name.');
    return stored;
  }

  private membersOf(w: any): { name: string; mobile: string }[] {
    return (w?.members || []).filter((m: any) => m && (m.name || m.mobile))
      .map((m: any) => ({ name: m.name || '', mobile: norm10(m.mobile) }));
  }
  private async isWardMember(body: string, ward: number, req: Requester): Promise<boolean> {
    if (req.role === 'admin') return true;
    const w = await this.wards.findOne({ body: body || 'Gondia', number: ward }).lean();
    const me = norm10(req.mobile);
    return !!me && this.membersOf(w).some((m) => m.mobile === me);
  }

  // ---- wards + bodies + agencies ------------------------------------------
  // List wards, optionally scoped to one body (town / gram panchayat). Ward
  // numbers repeat across bodies, so open-counts are keyed by (body, number).
  async listWards(city = 'Gondia', body?: string) {
    const filter: any = { city: new RegExp('^' + city + '$', 'i'), active: { $ne: false } };
    if (body) filter.body = body;
    const ws = await this.wards.find(filter).lean();
    // Score each ward by engagement (raise-hand + comments + shares) and post
    // count, from its visible complaints — this drives the ward ordering.
    const cFilter: any = { city: new RegExp('^' + city + '$', 'i'), status: { $nin: HIDDEN } };
    if (body) cFilter.body = body;
    const cs = await this.complaints.find(cFilter, { body: 1, ward: 1, likes: 1, shares: 1, status: 1 }).lean();
    const ids = cs.map((c: any) => String(c._id));
    const ccAgg = ids.length
      ? await this.comments.aggregate([{ $match: { complaint_id: { $in: ids }, status: 'approved' } }, { $group: { _id: '$complaint_id', n: { $sum: 1 } } }])
      : [];
    const ccMap = new Map(ccAgg.map((x: any) => [String(x._id), x.n]));
    const key = (b: string, w: number) => `${b || 'Gondia'}#${w}`;
    const stat = new Map<string, { posts: number; open: number; eng: number }>();
    for (const c of cs as any[]) {
      const k = key(c.body, c.ward);
      const s = stat.get(k) || { posts: 0, open: 0, eng: 0 };
      s.posts += 1;
      if (OPEN_LIKE.includes(c.status)) s.open += 1;
      s.eng += (c.likes?.length || 0) + (c.shares || 0) + (ccMap.get(String(c._id)) || 0);
      stat.set(k, s);
    }
    const rows = ws.map((w: any) => {
      const s = stat.get(key(w.body, w.number)) || { posts: 0, open: 0, eng: 0 };
      return {
        id: String(w._id), number: w.number, name: w.name || '', address: w.address || '',
        members: this.membersOf(w), photo: w.photo || '',
        body: w.body || 'Gondia', taluka: w.taluka || '',
        open: s.open, posts: s.posts, engagement: s.eng,
      };
    });
    // Most-engaged wards first, then most posts, then ward number.
    rows.sort((a, b) => b.engagement - a.engagement || b.posts - a.posts || a.number - b.number);
    return rows;
  }
  async getWard(id: string) {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new NotFoundException('Ward not found'); // non-ObjectId (e.g. legacy /ward/20) → 404, not a cast 500
    const w = await this.wards.findById(id).lean();
    if (!w) throw new NotFoundException('Ward not found');
    return {
      id: String(w._id), number: w.number, name: w.name || '', address: w.address || '',
      members: this.membersOf(w), body: w.body || 'Gondia', taluka: w.taluka || '', city: w.city || 'Gondia',
    };
  }
  // Bodies (towns/GPs) for a city, with ward + open-complaint counts, grouped by taluka.
  async listBodies(city = 'Gondia') {
    const bs = await this.bodies.find({ city: new RegExp('^' + city + '$', 'i'), active: { $ne: false } }).sort({ taluka: 1, name: 1 }).lean();
    const [openCounts, wardCounts] = await Promise.all([
      this.complaints.aggregate([{ $match: { status: { $in: OPEN_LIKE } } }, { $group: { _id: '$body', n: { $sum: 1 } } }]),
      this.wards.aggregate([{ $match: { active: { $ne: false } } }, { $group: { _id: '$body', n: { $sum: 1 } } }]),
    ]);
    const om = new Map(openCounts.map((c: any) => [c._id, c.n]));
    const wm = new Map(wardCounts.map((c: any) => [c._id, c.n]));
    return bs.map((b: any) => ({
      name: b.name, type: b.type || 'municipal', taluka: b.taluka || '',
      pincodes: b.pincodes || [], wards: wm.get(b.name) || 0, open: om.get(b.name) || 0,
    }));
  }
  async bodyByPincode(pin: string) {
    const b = await this.bodies.findOne({ pincodes: pin, active: { $ne: false } }).lean();
    return b ? { name: b.name, taluka: b.taluka || '', type: b.type || 'municipal' } : null;
  }
  async listAgencies() {
    return (await this.agencies.find({ active: { $ne: false } }).sort({ order: 1 }).lean())
      .map((a: any) => ({ name: a.name, helpline: a.helpline || '' }));
  }
  async adminListWards(city = 'Gondia') {
    return this.wards.find({ city: new RegExp('^' + city + '$', 'i') }).sort({ body: 1, number: 1 }).lean();
  }
  async adminListBodies(city = 'Gondia') {
    return this.bodies.find({ city: new RegExp('^' + city + '$', 'i') }).sort({ taluka: 1, name: 1 }).lean();
  }
  async upsertBody(dto: any) {
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('Body name is required.');
    const set: any = {
      name, type: dto.type || 'municipal', taluka: String(dto.taluka || '').trim(), city: dto.city || 'Gondia',
      pincodes: (Array.isArray(dto.pincodes) ? dto.pincodes : []).map((p: any) => String(p).replace(/\D/g, '').slice(0, 6)).filter((p: string) => p.length === 6),
      active: dto.active !== false,
    };
    await this.bodies.findOneAndUpdate({ name, city: set.city }, { $set: set }, { upsert: true });
    return { ok: true };
  }
  async upsertWard(dto: any) {
    const members = (Array.isArray(dto.members) ? dto.members : [])
      .map((m: any) => ({ name: String(m?.name || '').trim().slice(0, 60), mobile: norm10(m?.mobile) }))
      .filter((m: any) => m.name || m.mobile);
    const body = String(dto.body || 'Gondia').trim() || 'Gondia';
    const set: any = {
      number: dto.number, name: dto.name ?? '', address: dto.address ?? '',
      members, photo: dto.photo ?? '', city: dto.city || 'Gondia',
      body, taluka: String(dto.taluka || body).trim(), body_type: dto.body_type || 'municipal',
      active: dto.active !== false,
    };
    await this.wards.findOneAndUpdate({ number: dto.number, city: set.city, body }, { $set: set }, { upsert: true });
    return { ok: true };
  }

  // ---- complaints ---------------------------------------------------------
  private toPublic(c: any) {
    return {
      id: String(c._id), ward: c.ward, body: c.body || 'Gondia', taluka: c.taluka || '',
      category: c.category, title: c.title,
      description: c.description, photos: c.photos || [], area: c.area, city: c.city,
      poster_name: c.poster_name, status: c.status, reason: c.reason || '',
      expected_date: c.expected_date || '', agency: c.agency || '',
      duplicate_of: c.duplicate_of || null, disputed: !!c.disputed,
      created_at: c.createdAt, resolved_at: c.resolved_at || null,
      like_count: (c.likes || []).length, liked: false, comment_count: 0,
      share_count: c.shares || 0,
    };
  }

  // Decorate a page of public complaints with the viewer's `liked` flag and the
  // approved comment count (for the Instagram-style feed).
  private async decorate(rows: any[], results: any[], req?: Requester) {
    const uid = req?.id ? String(req.id) : '';
    const ids = results.map((r) => r.id);
    const counts = ids.length
      ? await this.comments.aggregate([
          { $match: { complaint_id: { $in: ids }, status: 'approved' } },
          { $group: { _id: '$complaint_id', n: { $sum: 1 } } },
        ])
      : [];
    const cmap = new Map(counts.map((c: any) => [String(c._id), c.n]));
    const likeById = new Map(rows.map((r: any) => [String(r._id), (r.likes || []).map(String)]));
    for (const r of results) {
      r.comment_count = cmap.get(r.id) || 0;
      r.liked = !!uid && (likeById.get(r.id) || []).includes(uid);
    }
    return results;
  }

  async create(dto: any, req: Requester) {
    if (await this.auth.isBlocked(req.id)) throw new ForbiddenException('Your account is restricted.');
    const body = String(dto.body || 'Gondia').trim() || 'Gondia';
    const w = await this.wards.findOne({ number: dto.ward, body }).lean();
    if (!w) throw new BadRequestException('Pick a valid ward.');
    const name = await this.resolveName(req.id, dto.name);
    const doc = await this.complaints.create({
      ward: dto.ward, body, taluka: w.taluka || 'Gondia',
      category: dto.category, title: dto.title, description: dto.description || '',
      photos: (dto.photos || []).slice(0, 5), area: dto.area || '', city: w.city || 'Gondia',
      poster_user_id: req.id, poster_name: name, poster_mobile: norm10(req.mobile),
      status: 'pending',
    });
    return { id: String(doc._id), status: 'pending' };
  }

  async list(opts: { ward?: number; status?: string; city?: string; page?: number; body?: string }, req?: Requester) {
    const PAGE = 20;
    const page = Math.max(1, opts.page || 1);
    const base: any = { city: new RegExp('^' + (opts.city || 'Gondia') + '$', 'i') };
    if (opts.body) base.body = opts.body;
    if (opts.ward) base.ward = opts.ward;
    const filter: any = { ...base, status: { $nin: HIDDEN } };
    if (opts.status === 'open') filter.status = { $in: OPEN_LIKE };
    else if (opts.status === 'resolved') filter.status = 'resolved';
    const [rows, total] = await Promise.all([
      this.complaints.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
      this.complaints.countDocuments(filter),
    ]);
    let allRows = rows;
    let results = rows.map((r) => this.toPublic(r));
    // Show the requester their OWN pending submissions (hidden from others until
    // approved) so a poster always sees their post — under Open/All, page 1.
    if (req?.id && page === 1 && opts.status !== 'resolved') {
      const own = await this.complaints.find({ ...base, poster_user_id: req.id, status: 'pending' }).sort({ createdAt: -1 }).lean();
      if (own.length) { allRows = [...own, ...rows]; results = [...own.map((r) => this.toPublic(r)), ...results]; }
    }
    await this.decorate(allRows, results, req);
    return { page, page_size: PAGE, total: total + (results.length - rows.length), results };
  }

  async detail(id: string, req?: Requester) {
    const c = await this.complaints.findById(id).lean();
    if (!c) throw new NotFoundException('Complaint not found');
    const isOwner = req && String(c.poster_user_id) === String(req.id);
    const isAdmin = req?.role === 'admin';
    if (HIDDEN.includes(c.status) && !isOwner && !isAdmin) throw new NotFoundException('Complaint not found');
    // Comments need approval, but the AUTHOR always sees their own (marked
    // pending) so it never looks like it vanished. Admin sees everything;
    // everyone else sees approved + their own pending.
    let cmFilter: any;
    if (isAdmin) cmFilter = { complaint_id: id };
    else if (req?.id) cmFilter = { complaint_id: id, $or: [{ status: 'approved' }, { author_user_id: String(req.id), status: 'pending' }] };
    else cmFilter = { complaint_id: id, status: 'approved' };
    const cms = await this.comments.find(cmFilter).sort({ createdAt: 1 }).lean();
    const ward = await this.wards.findOne({ body: c.body || 'Gondia', number: c.ward }).lean();
    return {
      ...this.toPublic(c),
      liked: !!req?.id && (c.likes || []).map(String).includes(String(req.id)),
      comment_count: cms.filter((m: any) => m.status === 'approved').length,
      is_admin: isAdmin,
      can_resolve: (!!isOwner || isAdmin) && c.status !== 'resolved',
      can_reopen: !!isOwner && ['resolved', 'closed'].includes(c.status),
      can_manage: req ? await this.isWardMember(c.body || 'Gondia', c.ward, req) : false,
      ward_members: this.membersOf(ward),
      comments: cms.map((m: any) => ({
        id: String(m._id), author_name: m.author_name, author_role: m.author_role,
        text: m.text, status: m.status, created_at: m.createdAt,
      })),
    };
  }

  async mine(userId: string) {
    const rows = await this.complaints.find({ poster_user_id: userId }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => this.toPublic(r));
  }

  async comment(id: string, dto: any, req: Requester) {
    if (await this.auth.isBlocked(req.id)) throw new ForbiddenException('Your account is restricted.');
    const c = await this.complaints.findById(id).lean();
    if (!c || HIDDEN.includes(c.status)) throw new NotFoundException('Complaint not found');
    const name = await this.resolveName(req.id, dto.name);
    const member = await this.isWardMember(c.body || 'Gondia', c.ward, req);
    const role = req.role === 'admin' ? 'admin' : member ? 'ward_member' : 'public';
    // Official (member/admin) comments post live; residents' wait for approval (decision #3).
    const status = role === 'public' ? 'pending' : 'approved';
    const doc = await this.comments.create({
      complaint_id: id, author_user_id: req.id, author_name: name, author_role: role, text: dto.text, status,
    });
    return { id: String(doc._id), status };
  }

  async resolve(id: string, req: Requester) {
    const c = await this.complaints.findById(id);
    if (!c) throw new NotFoundException('Complaint not found');
    if (String(c.poster_user_id) !== String(req.id) && req.role !== 'admin')
      throw new ForbiddenException('Only the person who posted (or admin) can mark it resolved.');
    c.status = 'resolved'; c.resolved_at = new Date(); c.disputed = false;
    await c.save();
    return { ok: true };
  }

  // Toggle a "like" (civic "me too / I'm affected too") for the logged-in user.
  async toggleLike(id: string, req: Requester) {
    const c = await this.complaints.findById(id).lean();
    if (!c || HIDDEN.includes(c.status)) throw new NotFoundException('Complaint not found');
    const uid = String(req.id);
    const has = (c.likes || []).map(String).includes(uid);
    await this.complaints.findByIdAndUpdate(id, has ? { $pull: { likes: uid } } : { $addToSet: { likes: uid } });
    return { liked: !has, like_count: (c.likes || []).length + (has ? -1 : 1) };
  }

  // Loose share tally (no auth, no per-user tracking — just a counter).
  async bumpShare(id: string) {
    const c = await this.complaints.findByIdAndUpdate(id, { $inc: { shares: 1 } }, { new: true, projection: { shares: 1 } }).lean();
    return { share_count: (c as any)?.shares || 0 };
  }

  // Poster reopens a complaint the authority marked done/can't-take-up.
  async dispute(id: string, req: Requester) {
    const c = await this.complaints.findById(id);
    if (!c) throw new NotFoundException('Complaint not found');
    if (String(c.poster_user_id) !== String(req.id)) throw new ForbiddenException('Only the person who posted can reopen.');
    if (['resolved', 'closed'].includes(c.status)) { c.status = 'open'; c.resolved_at = null; }
    c.disputed = true;
    await c.save();
    return { ok: true };
  }

  // Ward member / admin sets one of the 3 dispositions:
  //   in_progress → being worked on (reason optional)
  //   closed      → "Can't take up" (public reason REQUIRED)
  //   resolved    → "Mark done" (closes; the poster can reopen)
  async setStatus(id: string, dto: any, req: Requester) {
    const c = await this.complaints.findById(id);
    if (!c) throw new NotFoundException('Complaint not found');
    if (!(await this.isWardMember(c.body || 'Gondia', c.ward, req))) throw new ForbiddenException('Only the ward member or admin can update this.');
    const status = String(dto.status || '');
    if (!['in_progress', 'closed', 'resolved'].includes(status)) throw new BadRequestException('Invalid status.');
    if (status === 'closed' && !String(dto.reason || '').trim())
      throw new BadRequestException('Please add a reason (it is shown publicly).');
    c.status = status;
    c.reason = String(dto.reason || '').trim();
    c.resolved_at = status === 'resolved' ? new Date() : null;
    c.disputed = false;
    await c.save();
    return { ok: true };
  }

  // ---- admin moderation ---------------------------------------------------
  async pendingCount() {
    const [c, m] = await Promise.all([
      this.complaints.countDocuments({ status: 'pending' }),
      this.comments.countDocuments({ status: 'pending' }),
    ]);
    return { complaints: c, comments: m, total: c + m };
  }
  async pendingComplaints() {
    return (await this.complaints.find({ status: 'pending' }).sort({ createdAt: 1 }).lean()).map((r) => this.toPublic(r));
  }
  async pendingComments() {
    const cms = await this.comments.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
    const ids = [...new Set(cms.map((m: any) => String(m.complaint_id)))];
    const cs = ids.length ? await this.complaints.find({ _id: { $in: ids } }, { title: 1 }).lean() : [];
    const tmap = new Map(cs.map((c: any) => [String(c._id), c.title]));
    return cms.map((m: any) => ({
      id: String(m._id), complaint_id: String(m.complaint_id), complaint_title: tmap.get(String(m.complaint_id)) || '',
      author_name: m.author_name, author_role: m.author_role, text: m.text, created_at: m.createdAt,
    }));
  }
  async approveComplaint(id: string) { await this.complaints.findByIdAndUpdate(id, { status: 'open' }); return { ok: true }; }
  async rejectComplaint(id: string, reason?: string) { await this.complaints.findByIdAndUpdate(id, { status: 'rejected', reason: String(reason || '').trim() }); return { ok: true }; }
  async approveComment(cid: string) { await this.comments.findByIdAndUpdate(cid, { status: 'approved' }); return { ok: true }; }
  async rejectComment(cid: string) { await this.comments.findByIdAndUpdate(cid, { status: 'hidden' }); return { ok: true }; }
  // Admin can set any status incl. resolved/rejected/open (override).
  async adminSetStatus(id: string, dto: any, req: Requester) {
    if (dto.status === 'resolved') { await this.complaints.findByIdAndUpdate(id, { status: 'resolved', resolved_at: new Date() }); return { ok: true }; }
    if (dto.status === 'open' || dto.status === 'rejected') { await this.complaints.findByIdAndUpdate(id, { status: dto.status, reason: String(dto.reason || '').trim() }); return { ok: true }; }
    return this.setStatus(id, dto, { ...req, role: 'admin' });
  }
}
