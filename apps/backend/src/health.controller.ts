import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BRAND } from './brand';

@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  // GET /api/v1/health
  @Get('health')
  health() {
    return {
      ok: true,
      brand: { key: BRAND.key, displayName: BRAND.displayName },
      db: {
        name: this.conn.name,
        state: this.conn.readyState, // 1 = connected
      },
    };
  }

  // GET /api/v1/config — public brand/config for the frontend.
  @Get('config')
  config() {
    return {
      key: BRAND.key,
      displayName: BRAND.displayName,
      tagline: BRAND.tagline ?? '',
      domain: BRAND.domain ?? null,
    };
  }
}
