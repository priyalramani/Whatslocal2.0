import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ProfileService } from './profile.service';
import { AuthService } from '../auth/auth.service';

// Profile facts we collect from visitors (gender for now). Everything here works
// ANONYMOUSLY — the value is stored against the device's visitor_id; the bearer
// (if present) is used only to also link/mirror to the account. The number is
// never trusted from the body — same pattern as push/subscribe.
@Controller()
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly auth: AuthService,
  ) {}

  private async userIdFrom(authz?: string): Promise<string | null> {
    if (authz?.startsWith('Bearer ')) {
      try { return (await this.auth.verify(authz.slice(7))).id; } catch { /* anonymous */ }
    }
    return null;
  }

  // '' = unknown → the app shows the prompt. Visitor id comes in the query so it
  // works with no login.
  @Get('profile/gender')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getGender(@Query('vid') vid: string, @Headers('authorization') authz: string) {
    const userId = await this.userIdFrom(authz);
    return { gender: await this.profile.getGender(vid || '', userId) };
  }

  @Post('profile/gender')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  async setGender(@Body() body: { visitor_id?: string; gender?: string }, @Headers('authorization') authz: string) {
    const userId = await this.userIdFrom(authz);
    return this.profile.setGender(body?.visitor_id || '', body?.gender || '', userId);
  }
}
