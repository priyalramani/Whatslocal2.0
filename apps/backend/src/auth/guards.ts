import {
  CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

function bearer(req: any): string | null {
  const h = String(req.headers?.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Requires a valid JWT; attaches req.user.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('Missing bearer token.');
    req.user = await this.auth.verify(token);
    return true;
  }
}

// Requires a valid JWT AND role === 'admin'.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('Missing bearer token.');
    const user = await this.auth.verify(token);
    if (user.role !== 'admin') throw new ForbiddenException('Admin access required.');
    req.user = user;
    return true;
  }
}
