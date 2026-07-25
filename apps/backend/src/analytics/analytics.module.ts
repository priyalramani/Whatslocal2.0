import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent, AnalyticsEventSchema } from './analytics.schema';
import { Listing, ListingSchema } from '../listings/listing.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: Listing.name, schema: ListingSchema },
    ]),
    AuthModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
