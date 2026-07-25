import { Body, Controller, Get, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /api/v1/auth/login  { username, password } → { token, user }  (admin)
  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    if (!body?.username || !body?.password) {
      throw new BadRequestException('username and password are required.');
    }
    return this.auth.login(body.username, body.password);
  }

  // ---- OTP (general users) ----

  // POST /api/v1/auth/otp/request { mobile }
  @Post('otp/request')
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  requestOtp(@Body() body: { mobile?: string }) {
    if (!body?.mobile) throw new BadRequestException('mobile is required.');
    return this.auth.requestOtp(body.mobile);
  }

  // POST /api/v1/auth/otp/verify { mobile, otp } → { token, user }  (demo login)
  @Post('otp/verify')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  verifyOtp(@Body() body: { mobile?: string; otp?: string }) {
    if (!body?.mobile || !body?.otp) throw new BadRequestException('mobile and otp are required.');
    return this.auth.loginOtp(body.mobile, body.otp);
  }

  // POST /api/v1/auth/otp/widget-verify { accessToken } → { token, user }
  // Real login: confirms the MSG91 widget access-token + reads the verified number.
  @Post('otp/widget-verify')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  widgetVerify(@Body() body: { accessToken?: string }) {
    if (!body?.accessToken) throw new BadRequestException('accessToken is required.');
    return this.auth.loginWidget(body.accessToken);
  }

  // POST /api/v1/auth/number/verify { mobile, otp } → { mobile_token }  (demo)
  // Proves ownership of a different contact number (posting on behalf).
  @Post('number/verify')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  verifyNumber(@Body() body: { mobile?: string; otp?: string }) {
    if (!body?.mobile || !body?.otp) throw new BadRequestException('mobile and otp are required.');
    return this.auth.verifyNumber(body.mobile, body.otp);
  }

  // POST /api/v1/auth/number/widget-verify { accessToken } → { mobile_token }
  @Post('number/widget-verify')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  widgetVerifyNumber(@Body() body: { accessToken?: string }) {
    if (!body?.accessToken) throw new BadRequestException('accessToken is required.');
    return this.auth.verifyNumberWidget(body.accessToken);
  }

  // GET /api/v1/auth/me — current user (+ stored display name from the DB, since
  // the JWT itself doesn't carry the name).
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return { ...req.user, name: await this.auth.myName(req.user.id) };
  }

  // POST /api/v1/auth/me/name { name } — set the display name once, then reused
  // for every complaint/comment (asked right after login, never per-post).
  @Post('me/name')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async setMyName(@Body() body: { name?: string }, @Req() req: any) {
    const name = String(body?.name || '').trim();
    if (name.length < 2) throw new BadRequestException('Please enter your name.');
    await this.auth.setName(req.user.id, name);
    return { name: name.slice(0, 60) };
  }
}
