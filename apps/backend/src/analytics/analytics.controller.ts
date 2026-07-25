import { Body, Controller, Get, Headers, Ip, Param, Post, Query, HttpCode, Req, UseGuards } from '@nestjs/common';
import type { AnalyticsEventInput } from '@whatslocal/types';
import { AnalyticsService } from './analytics.service';
import { parseUserAgent } from './device';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // POST /api/v1/events — fire-and-forget ingest from the browser.
  // Server stamps ts, parses device from UA, captures ip.
  @Post('events')
  @HttpCode(202)
  async ingest(
    @Body() body: AnalyticsEventInput,
    @Headers('user-agent') ua: string,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    if (body?.type && body?.visitor_id && body?.session_id) {
      await this.analytics.record(body, parseUserAgent(ua || ''), ip || '');
    }
    return { ok: true };
  }

  // POST /api/v1/events/identify — after login, link this visitor's anonymous
  // history to the now-known user. user_id comes from the auth token, not the
  // body, so a visitor can only ever be linked to the caller's own identity.
  @Post('events/identify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async identify(@Body() body: { visitor_id?: string }, @Req() req: any) {
    return this.analytics.identify(body?.visitor_id || '', req.user?.id || '');
  }

  // GET /api/v1/events/affinity — vertical scores for the home's dynamic tiles
  // (v2). Non-sensitive ranking signal; ids passed as query so it works for
  // anonymous + logged-in without a token.
  @Get('events/affinity')
  affinity(@Query('visitor_id') visitorId?: string, @Query('user_id') userId?: string) {
    return this.analytics.affinity(visitorId, userId);
  }

  // GET /api/v1/stats/trending?city=Gondia — public. Listings ranked by real
  // contact-demand in the last 7 days (home "Trending this week" rail). Under the
  // 'stats' prefix so it never collides with listings/:id.
  @Get('stats/trending')
  async trending(@Query('city') city?: string) {
    return this.analytics.trending(city);
  }

  // GET /api/v1/stats/visitors-today?city=Gondia — public, just a number.
  // Inflated server-side for social proof (real count never leaves the server):
  //   shown = floor(BASE + real * MULTIPLIER)
  @Get('stats/visitors-today')
  async visitorsToday(@Query('city') city?: string) {
    const real = await this.analytics.visitorsToday(city);
    const mult = Number(process.env.INFLATE_MULTIPLIER) || 1;
    const base = Number(process.env.INFLATE_BASE) || 0;
    return { count: Math.floor(base + real * mult) };
  }

  // GET /api/v1/stats/postings?city=Gondia — public. Live posting count inflated
  // ×3.78 (social proof); the real number never leaves the server.
  @Get('stats/postings')
  async postings(@Query('city') city?: string) {
    const real = await this.analytics.postingsCount(city);
    const mult = Number(process.env.POSTINGS_MULTIPLIER) || 3.78;
    return { count: Math.round(real * mult) };
  }

  // GET /api/v1/analytics/summary?from=ISO&to=ISO  (defaults: last 30 days)
  // Admin-only — the dashboard data.
  @Get('analytics/summary')
  @UseGuards(AdminGuard)
  async summary(@Query('from') from?: string, @Query('to') to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.analytics.summary(fromDate, toDate);
  }

  // GET /api/v1/analytics/user-report?from=YYYY-MM-DD&to=YYYY-MM-DD — admin.
  // Day-wise visitors split new vs repeat. Dates are IST calendar days.
  @Get('analytics/user-report')
  @UseGuards(AdminGuard)
  async userReport(@Query('from') from?: string, @Query('to') to?: string) {
    const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    const toD = day(to) ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
    const fromD = day(from) ? new Date(`${from}T00:00:00.000+05:30`) : new Date(toD.getTime() - 6 * 86400000);
    return this.analytics.userReport(fromD, toD);
  }

  // GET /api/v1/analytics/contact-report?from=YYYY-MM-DD&to=YYYY-MM-DD — admin.
  // Day-wise contact actions split call / WhatsApp / copy, deduped per
  // (visitor, listing, day, channel). IST calendar days.
  @Get('analytics/contact-report')
  @UseGuards(AdminGuard)
  async contactReport(@Query('from') from?: string, @Query('to') to?: string) {
    const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    const toD = day(to) ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
    const fromD = day(from) ? new Date(`${from}T00:00:00.000+05:30`) : new Date(toD.getTime() - 6 * 86400000);
    return this.analytics.contactReport(fromD, toD);
  }

  // GET /api/v1/analytics/visitors?page=1&identified=1 — admin user list.
  @Get('analytics/visitors')
  @UseGuards(AdminGuard)
  async visitors(@Query('page') page?: string, @Query('identified') identified?: string) {
    return this.analytics.visitors({
      page: page ? parseInt(page, 10) : 1,
      identifiedOnly: identified === '1' || identified === 'true',
    });
  }

  // GET /api/v1/analytics/visitors/:visitorId — deep per-visitor detail.
  @Get('analytics/visitors/:visitorId')
  @UseGuards(AdminGuard)
  async visitorDetail(@Param('visitorId') visitorId: string) {
    return this.analytics.visitorDetail(visitorId);
  }

  // GET /api/v1/analytics/leads?page=1 — contact-interest feed (who acted on
  // which post's contact + how). Admin-only; the basis for future billing.
  @Get('analytics/leads')
  @UseGuards(AdminGuard)
  async leads(@Query('page') page?: string) {
    return this.analytics.leads(page ? parseInt(page, 10) : 1);
  }

  // GET /api/v1/analytics/registered-users — admin. One row per OTP-registered
  // user (newest first) with an at-a-glance profile (source, contacts, times,
  // language, interest, income). Drill-in = the visitor detail by user_id.
  @Get('analytics/registered-users')
  @UseGuards(AdminGuard)
  async registeredUsers() {
    return this.analytics.registeredUsers();
  }

  // GET /api/v1/analytics/posts — admin. Per-post reach: landings via link,
  // distinct visitors, views, and people who requested the contact.
  @Get('analytics/posts')
  @UseGuards(AdminGuard)
  async postAnalytics() {
    return this.analytics.postAnalytics();
  }
}
