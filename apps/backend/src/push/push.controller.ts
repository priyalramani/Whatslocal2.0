import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PushService } from './push.service';
import { AuthService } from '../auth/auth.service';
import { AdminGuard } from '../auth/guards';

@Controller()
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly auth: AuthService,
  ) {}

  // Public: the VAPID public key the browser needs to subscribe.
  @Get('push/vapid-key')
  vapidKey() {
    return { key: this.push.vapidPublicKey() };
  }

  // Store a subscription. Works for anonymous visitors; user_id is read from an
  // optional bearer (never trusted from the body). UA taken from the header.
  @Post('push/subscribe')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  async subscribe(
    @Body() body: { subscription?: any; visitor_id?: string; city?: string },
    @Headers('authorization') authz: string,
    @Headers('user-agent') ua: string,
  ) {
    let userId: string | null = null;
    let role = '';
    if (authz?.startsWith('Bearer ')) {
      // Role is read from the VERIFIED token, never the body — so only a genuine
      // admin session can register a device as an admin push target.
      try { const u = await this.auth.verify(authz.slice(7)); userId = u.id; role = u.role || ''; } catch { /* anon */ }
    }
    return this.push.subscribe(body?.subscription, {
      visitor_id: body?.visitor_id,
      user_id: userId,
      admin: role === 'admin',
      role,
      city: body?.city,
      ua: ua || '',
    });
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body() body: { endpoint?: string }) {
    return this.push.unsubscribe(body?.endpoint || '');
  }

  // Admin "Test notification" — sends a test push to the calling admin's own
  // device(s). Admin-guarded; the /admin/ prefix also makes the web client send
  // the admin token. Returns how many devices it reached.
  @Post('admin/push/test')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async test(@Req() req: any) {
    return this.push.sendTestToUser(req.user?.id || '');
  }

  // Called after login: link this visitor's device subscriptions to the user.
  @Post('push/link')
  @HttpCode(200)
  async link(@Body() body: { visitor_id?: string }, @Headers('authorization') authz: string) {
    let userId: string | null = null;
    if (authz?.startsWith('Bearer ')) {
      try { userId = (await this.auth.verify(authz.slice(7))).id; } catch { /* ignore */ }
    }
    if (!userId) return { linked: 0 };
    return this.push.linkUser(body?.visitor_id || '', userId);
  }
}
