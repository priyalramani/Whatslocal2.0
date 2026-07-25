import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TripsService } from './trips.service';
import { CreateTripDto, RepostTripDto } from './dto';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  // Public: live trips on a route. No login — a traveller must be able to look
  // before signing up.
  @Get('trips')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  search(@Query('from') from?: string, @Query('to') to?: string, @Query('date') date?: string, @Query('city') city?: string) {
    return this.trips.search({ from, to, date, city });
  }

  // Distinct live routes → From/To pickers only ever offer real options.
  @Get('trips/routes')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  routes() {
    return this.trips.routes();
  }

  @Get('trips/mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: any) {
    return this.trips.mine(req.user.id);
  }

  // Operators post their own trips — login required (accountable phone).
  @Post('trips')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(@Body() dto: CreateTripDto, @Req() req: any) {
    return this.trips.create(dto, { id: req.user.id, mobile: req.user.mobile });
  }

  @Post('trips/:id/repost')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  repost(@Param('id') id: string, @Body() dto: RepostTripDto, @Req() req: any) {
    return this.trips.repost(id, dto, req.user.id);
  }

  @Post('trips/:id/active')
  @UseGuards(JwtAuthGuard)
  setActive(@Param('id') id: string, @Body() body: { active: boolean }, @Req() req: any) {
    return this.trips.setActive(id, body?.active !== false, req.user.id);
  }

  // ===== Admin: Cab Sharing is its own section, with only cab fields =====
  @Get('admin/trips')
  @UseGuards(AdminGuard)
  adminList(@Query('expired') expired?: string) {
    return this.trips.adminList(expired === '1' || expired === 'true');
  }

  @Post('admin/trips')
  @UseGuards(AdminGuard)
  adminCreate(@Body() dto: CreateTripDto, @Req() req: any) {
    return this.trips.adminCreate(dto, req.user.id);
  }

  @Patch('admin/trips/:id')
  @UseGuards(AdminGuard)
  adminUpdate(@Param('id') id: string, @Body() dto: Partial<CreateTripDto>) {
    return this.trips.adminUpdate(id, dto);
  }

  @Post('admin/trips/:id/active')
  @UseGuards(AdminGuard)
  adminSetActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.trips.adminSetActive(id, body?.active !== false);
  }

  @Delete('admin/trips/:id')
  @UseGuards(AdminGuard)
  adminRemove(@Param('id') id: string) {
    return this.trips.adminRemove(id);
  }
}
