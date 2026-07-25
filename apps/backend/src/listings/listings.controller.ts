import {
  Body, Controller, Get, Header, Param, Post, Put, Query, Req, Headers, UseGuards, StreamableFile,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Patch } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { AuthService } from '../auth/auth.service';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { CreateListingDto, SearchQueryDto, RevealDto, ReportDto, AdminUpdateListingDto } from './dto';

@Controller()
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly auth: AuthService,
  ) {}

  // Submission → pending. Requires login (OTP user or admin). Admin is exempt
  // from the contact-number ownership check (handled in the service).
  @Post('listings')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  create(@Body() dto: CreateListingDto, @Req() req: any) {
    return this.listings.create(dto, {
      userId: req.user.id, role: req.user.role, userMobile: req.user.mobile || '',
    });
  }

  // Upload ONE listing photo (login required). Re-encodes to compressed view +
  // thumb derivatives and returns the key to put in the post's photos[].
  @Post('listings/upload')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async upload(@UploadedFile() file: any) {
    return this.listings.processUpload(file);
  }

  // Public search — projected + paginated. Home alone fires one of these per
  // section, so the limit must absorb several loads + infinite scroll per
  // minute. Results carry no PII (phones are gated behind /reveal), so a higher
  // read limit is fine; bulk scraping is still bounded.
  @Get('listings/search')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  search(@Query() q: SearchQueryDto, @Headers('user-agent') ua?: string) {
    const num = (s?: string) => (s != null && s !== '' ? parseInt(s, 10) : undefined);
    // Crawlers must never consume a prime slot or earn visibility points.
    const bot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless/i.test(ua || '');
    return this.listings.search({
      q: q.q, city: q.city, kind: q.kind, category: q.category, post_type: q.post_type, sale_or_rent: q.sale_or_rent,
      vid: q.vid, bot,
      page: q.page ? parseInt(q.page, 10) : 1,
      gender: q.gender,
      ageMin: num(q.age_min), ageMax: num(q.age_max),
      expMin: num(q.exp_min), expMax: num(q.exp_max),
      salMin: num(q.sal_min), salMax: num(q.sal_max),
    });
  }

  // Home page: ordered sections (kinds + business categories) with top listings.
  @Get('home/sections')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  homeSections(@Query('city') city?: string) {
    return this.listings.homeSections(city);
  }

  // Home feeds + skip-empty counts (declared BEFORE listings/:id so 'offers' /
  // 'new' aren't swallowed as an :id).
  @Get('listings/offers')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  offers(@Query('city') city?: string, @Query('category') category?: string) {
    return this.listings.offers(city, category);
  }
  @Get('listings/new')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  recent(@Query('city') city?: string, @Query('v') v?: string) {
    return this.listings.recent(city, v);
  }
  @Get('listings/vertical-counts')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  verticalCounts(@Query('city') city?: string) {
    return this.listings.verticalCounts(city);
  }
  // Real categories present in a bucket (drives the data-driven category rail).
  @Get('listings/categories')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  categories(@Query('city') city?: string, @Query('kind') kind?: string, @Query('post_type') postType?: string, @Query('sale_or_rent') saleOrRent?: string, @Query('no_sell') noSell?: string) {
    return this.listings.categoryBreakdown(city, kind, postType, saleOrRent, noSell === '1' || noSell === 'true');
  }

  // The logged-in user's own posts.
  @Get('listings/mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: any) {
    return this.listings.mine(req.user.id);
  }

  // Duplicate check as the poster types the contact number: returns THIS
  // requester's existing postings (admin sees all) with the same number in the
  // same kind, so the form can warn + link straight to editing them. JWT so a
  // number can only surface postings the caller may already edit (no scraping).
  @Post('listings/check-duplicate')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  checkDuplicate(@Body() body: { mobile?: string; kind?: string; exclude_id?: string }, @Req() req: any) {
    return this.listings.checkDuplicate(body?.mobile || '', body?.kind || '', body?.exclude_id, req.user);
  }

  // Owner (or admin) hides/shows their own listing.
  @Post('listings/:id/active')
  @UseGuards(JwtAuthGuard)
  setActiveOwned(@Param('id') id: string, @Body() body: { active: boolean }, @Req() req: any) {
    return this.listings.setActiveOwned(id, req.user.id, req.user.role, body.active !== false);
  }

  @Get('listings/:id')
  async getOne(@Param('id') id: string, @Headers('authorization') authz: string) {
    let userId: string | undefined;
    if (authz?.startsWith('Bearer ')) {
      try { userId = (await this.auth.verify(authz.slice(7))).id; } catch { /* anon */ }
    }
    return this.listings.getPublic(id, userId);
  }

  // Social link-preview (Open Graph) for crawler bots. nginx routes bot
  // user-agents here with ?path=<original-url>; humans get the SPA instead.
  @Get('og')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  og(@Headers('x-og-path') ogPath?: string, @Query('path') path?: string) {
    return this.listings.ogHtml(ogPath || path || '/');
  }

  // Dynamically-rendered share thumbnail (PNG) for a listing with no photo.
  // Fetched directly by WhatsApp/social crawlers from the og:image URL.
  @Get('og/img')
  @Header('Cache-Control', 'public, max-age=86400')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async ogImg(@Query('id') id?: string, @Query('path') path?: string): Promise<StreamableFile> {
    const buf = path ? await this.listings.ogBrowseImage(path) : await this.listings.ogImage(id || '');
    return new StreamableFile(buf, { type: 'image/jpeg' });
  }

  // Public detail by readable URL slug (the /city/Title_Of_Listing permalink).
  @Get('listings/by-slug/:slug')
  async getOneBySlug(@Param('slug') slug: string, @Headers('authorization') authz: string) {
    let userId: string | undefined;
    if (authz?.startsWith('Bearer ')) {
      try { userId = (await this.auth.verify(authz.slice(7))).id; } catch { /* anon */ }
    }
    return this.listings.getPublicBySlug(slug, userId);
  }

  // Owner (or admin) loads the full doc to edit.
  @Get('listings/:id/full')
  @UseGuards(JwtAuthGuard)
  getForEdit(@Param('id') id: string, @Req() req: any) {
    return this.listings.getForEdit(id, req.user.id, req.user.role);
  }

  // Owner (or admin) saves edits. Owner edits go back to pending.
  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard)
  updateOwned(@Param('id') id: string, @Body() body: AdminUpdateListingDto, @Req() req: any) {
    return this.listings.updateOwned(id, req.user.id, req.user.role, body);
  }

  // Report a listing — LOGIN REQUIRED (every report is tied to a user).
  @Post('listings/:id/report')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async report(@Param('id') id: string, @Body() body: ReportDto, @Req() req: any) {
    return this.listings.report(id, body.reason, body.details || '', req.user.id, req.user.mobile || '', req.ip || '');
  }

  // GATED phone reveal. Reads optional bearer to lift the anon threshold.
  @Post('listings/:id/reveal')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  async reveal(
    @Param('id') id: string,
    @Body() body: RevealDto,
    @Headers('authorization') authz: string,
    @Req() req: any,
  ) {
    let userId: string | null = null;
    if (authz?.startsWith('Bearer ')) {
      try { userId = (await this.auth.verify(authz.slice(7))).id; } catch { /* anon */ }
    }
    const ip = req.ip || '';
    return this.listings.reveal(id, body.visitor_id, userId, ip);
  }

  // ---- admin ----
  // Admin creates a listing → publishes immediately (service sets approved).
  @Post('admin/listings')
  @UseGuards(AdminGuard)
  adminCreate(@Body() dto: CreateListingDto, @Req() req: any) {
    return this.listings.create(dto, { userId: req.user.id, role: 'admin', userMobile: '' });
  }

  @Get('admin/listings/pending')
  @UseGuards(AdminGuard)
  pending() {
    return this.listings.listPending();
  }
  @Get('admin/listings/pending/count')
  @UseGuards(AdminGuard)
  pendingCount() {
    return this.listings.pendingCount();
  }
  @Get('admin/listings/browse')
  @UseGuards(AdminGuard)
  adminBrowse(@Query() q: SearchQueryDto) {
    return this.listings.adminBrowse({ q: q.q, city: q.city, page: q.page ? parseInt(q.page, 10) : 1 });
  }
  @Post('admin/listings/:id/active')
  @UseGuards(AdminGuard)
  setActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.listings.setActive(id, body.active !== false);
  }
  @Post('admin/listings/:id/pin')
  @UseGuards(AdminGuard)
  setPinned(@Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.listings.setPinned(id, body.pinned !== false);
  }
  @Get('admin/listings/:id')
  @UseGuards(AdminGuard)
  adminGetOne(@Param('id') id: string) {
    return this.listings.getAdmin(id);
  }
  @Patch('admin/listings/:id')
  @UseGuards(AdminGuard)
  adminUpdate(@Param('id') id: string, @Body() body: AdminUpdateListingDto) {
    return this.listings.adminUpdate(id, body);
  }
  @Post('admin/listings/:id/approve')
  @UseGuards(AdminGuard)
  approve(@Param('id') id: string, @Req() req: any) {
    return this.listings.setStatus(id, 'approved', req.user.id);
  }
  @Post('admin/listings/:id/reject')
  @UseGuards(AdminGuard)
  reject(@Param('id') id: string, @Req() req: any) {
    return this.listings.setStatus(id, 'rejected', req.user.id);
  }

  // Admin home-section ordering (drag-drop).
  @Get('admin/home-sequence')
  @UseGuards(AdminGuard)
  homeSequence() {
    return this.listings.homeSequenceAdmin();
  }
  @Put('admin/home-sequence')
  @UseGuards(AdminGuard)
  setHomeSequence(@Body() body: { sequence: string[] }) {
    return this.listings.setHomeSequence(body?.sequence || []);
  }

  // Login-gate thresholds. PUBLIC read (the client enforces the time gate);
  // admin-only write from the Settings page.
  @Get('settings/login-gate')
  loginGate() {
    return this.listings.getLoginGate();
  }
  @Put('admin/login-gate')
  @UseGuards(AdminGuard)
  setLoginGate(@Body() body: { time_limit_minutes?: number; contact_limit?: number; daily_contact_limit?: number }) {
    return this.listings.setLoginGate(body || {});
  }

  @Get('admin/reports')
  @UseGuards(AdminGuard)
  reports(): Promise<any[]> {
    return this.listings.listReports();
  }
  // hide | show | restrict | unrestrict | reviewed — on a reported listing.
  @Post('admin/reports/:listingId/action')
  @UseGuards(AdminGuard)
  reportAction(@Param('listingId') listingId: string, @Body() body: { action: string; note?: string }, @Req() req: any) {
    return this.listings.moderationAction(listingId, body.action, req.user.username || req.user.name || 'admin', body.note || '');
  }
}
