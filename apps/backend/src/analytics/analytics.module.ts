import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent, AnalyticsEventSchema } from './analytics.schema';
import { Listing, ListingSchema } from '../listings/listing.schema';
import { VisitorProfile, VisitorProfileSchema } from '../profile/profile.schema';
import { AppConfig, AppConfigSchema } from '../listings/config.schema';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: Listing.name, schema: ListingSchema },
      { name: VisitorProfile.name, schema: VisitorProfileSchema },
      { name: AppConfig.name, schema: AppConfigSchema },
    ]),
    AuthModule,
    WhatsappModule, // for WhatsappService (contact-milestone notify)
    ListingsModule, // for ListingsService (hide / reply application)
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
