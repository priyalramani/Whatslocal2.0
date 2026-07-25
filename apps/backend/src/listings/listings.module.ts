import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { Listing, ListingSchema } from './listing.schema';
import { Reveal, RevealSchema } from './reveal.schema';
import { Report, ReportSchema } from './report.schema';
import { ModAction, ModActionSchema } from './moderation.schema';
import { AppConfig, AppConfigSchema } from './config.schema';
import { Visibility, VisibilitySchema } from './visibility.schema';
import { TagsModule } from '../tags/tags.module';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Listing.name, schema: ListingSchema },
      { name: Reveal.name, schema: RevealSchema },
      { name: Report.name, schema: ReportSchema },
      { name: ModAction.name, schema: ModActionSchema },
      { name: AppConfig.name, schema: AppConfigSchema },
      { name: Visibility.name, schema: VisibilitySchema },
    ]),
    TagsModule, // for TagsService (keyword name resolution)
    UtilityModule, // for PincodeService (cached pin → city/district/state)
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
