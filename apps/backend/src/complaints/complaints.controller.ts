import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ComplaintsService } from './complaints.service';
import { AuthService } from '../auth/auth.service';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { CreateComplaintDto, CommentDto, SetStatusDto, WardDto, RejectDto, BodyDto } from './dto';

@Controller()
export class ComplaintsController {
  constructor(
    private readonly svc: ComplaintsService,
    private readonly auth: AuthService,
  ) {}

  // ---- public ----
  @Get('wards')
  wards(@Query('city') city?: string, @Query('body') body?: string) { return this.svc.listWards(city || 'Gondia', body); }

  @Get('ward/:id')
  ward(@Param('id') id: string) { return this.svc.getWard(id); }

  // Local bodies (towns / gram panchayats) for a city, grouped by taluka.
  @Get('bodies')
  bodies(@Query('city') city?: string) { return this.svc.listBodies(city || 'Gondia'); }

  @Get('bodies/by-pincode/:pin')
  bodyByPincode(@Param('pin') pin: string) { return this.svc.bodyByPincode(pin); }

  @Get('agencies')
  agencies() { return this.svc.listAgencies(); }

  @Get('complaints')
  async list(@Query('ward') ward?: string, @Query('status') status?: string, @Query('city') city?: string, @Query('page') page?: string, @Query('body') body?: string, @Headers('authorization') authz?: string) {
    let req: any;
    if (authz?.startsWith('Bearer ')) { try { req = await this.auth.verify(authz.slice(7)); } catch { /* anon */ } }
    return this.svc.list({
      ward: ward ? parseInt(ward, 10) : undefined,
      status, city, page: page ? parseInt(page, 10) : 1, body,
    }, req);
  }

  @Get('complaints/:id')
  async detail(@Param('id') id: string, @Headers('authorization') authz: string) {
    let req: any;
    if (authz?.startsWith('Bearer ')) { try { req = await this.auth.verify(authz.slice(7)); } catch { /* anon */ } }
    return this.svc.detail(id, req);
  }

  // ---- user (login required) ----
  @Post('complaints')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(@Body() dto: CreateComplaintDto, @Req() r: any) { return this.svc.create(dto, r.user); }

  @Get('complaints-mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() r: any) { return this.svc.mine(r.user.id); }

  @Post('complaints/:id/comments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  comment(@Param('id') id: string, @Body() dto: CommentDto, @Req() r: any) { return this.svc.comment(id, dto, r.user); }

  @Post('complaints/:id/like')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  like(@Param('id') id: string, @Req() r: any) { return this.svc.toggleLike(id, r.user); }

  // Public — anyone who shares bumps the tally (no login).
  @Post('complaints/:id/share')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  share(@Param('id') id: string) { return this.svc.bumpShare(id); }

  @Post('complaints/:id/resolve')
  @UseGuards(JwtAuthGuard)
  resolve(@Param('id') id: string, @Req() r: any) { return this.svc.resolve(id, r.user); }

  @Post('complaints/:id/dispute')
  @UseGuards(JwtAuthGuard)
  dispute(@Param('id') id: string, @Req() r: any) { return this.svc.dispute(id, r.user); }

  // Ward member (matched by mobile) or admin sets a disposition.
  @Post('complaints/:id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @Req() r: any) { return this.svc.setStatus(id, dto, r.user); }

  // ---- admin ----
  @Get('admin/wards')
  @UseGuards(AdminGuard)
  adminWards(@Query('city') city?: string) { return this.svc.adminListWards(city || 'Gondia'); }

  @Post('admin/wards')
  @UseGuards(AdminGuard)
  upsertWard(@Body() dto: WardDto) { return this.svc.upsertWard(dto); }

  @Get('admin/bodies')
  @UseGuards(AdminGuard)
  adminBodies(@Query('city') city?: string) { return this.svc.adminListBodies(city || 'Gondia'); }

  @Post('admin/bodies')
  @UseGuards(AdminGuard)
  upsertBody(@Body() dto: BodyDto) { return this.svc.upsertBody(dto); }

  @Get('admin/complaints/pending/count')
  @UseGuards(AdminGuard)
  pendingCount() { return this.svc.pendingCount(); }

  @Get('admin/complaints/pending')
  @UseGuards(AdminGuard)
  pendingComplaints() { return this.svc.pendingComplaints(); }

  @Get('admin/complaints/comments/pending')
  @UseGuards(AdminGuard)
  pendingComments() { return this.svc.pendingComments(); }

  @Post('admin/complaints/:id/approve')
  @UseGuards(AdminGuard)
  approveComplaint(@Param('id') id: string) { return this.svc.approveComplaint(id); }

  @Post('admin/complaints/:id/reject')
  @UseGuards(AdminGuard)
  rejectComplaint(@Param('id') id: string, @Body() dto: RejectDto) { return this.svc.rejectComplaint(id, dto?.reason); }

  @Post('admin/complaints/:id/status')
  @UseGuards(AdminGuard)
  adminStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @Req() r: any) { return this.svc.adminSetStatus(id, dto, r.user); }

  @Post('admin/complaints/comments/:cid/approve')
  @UseGuards(AdminGuard)
  approveComment(@Param('cid') cid: string) { return this.svc.approveComment(cid); }

  @Post('admin/complaints/comments/:cid/reject')
  @UseGuards(AdminGuard)
  rejectComment(@Param('cid') cid: string) { return this.svc.rejectComment(cid); }
}
