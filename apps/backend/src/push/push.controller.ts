import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PushService } from './push.service';
import { AuthService } from '../auth/auth.service';

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
    if (authz?.startsWith('Bearer ')) {
      try { userId = (await this.auth.verify(authz.slice(7))).id; } catch { /* anon */ }
    }
    return this.push.subscribe(body?.subscription, {
      visitor_id: body?.visitor_id,
      user_id: userId,
      city: body?.city,
      ua: ua || '',
    });
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body() body: { endpoint?: string }) {
    return this.push.unsubscribe(body?.endpoint || '');
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
