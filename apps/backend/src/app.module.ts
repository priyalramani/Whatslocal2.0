import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { UtilityModule } from './utility/utility.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { TagsModule } from './tags/tags.module';
import { ListingsModule } from './listings/listings.module';
import { PushModule } from './push/push.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { TripsModule } from './trips/trips.module';
import { ProfileModule } from './profile/profile.module';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  // Fail fast — without a DB the app is useless.
  throw new Error('MONGODB_URI is not set. Copy .env.example to .env.');
}

@Module({
  imports: [
    MongooseModule.forRoot(MONGODB_URI),
    // Global rate limit: 240 requests / minute / IP. The user app is read-heavy
    // (home loads several sections, infinite scroll), so this needs headroom or
    // normal browsing trips it. Sensitive routes (reveal/create) keep tight
    // per-route limits below — that's where scrape protection actually matters.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    AuthModule,
    UtilityModule,
    AnalyticsModule,
    TagsModule,
    ListingsModule,
    PushModule,
    ComplaintsModule,
    TripsModule,
    ProfileModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
