import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import {
  Ward, WardSchema, Complaint, ComplaintSchema,
  ComplaintComment, ComplaintCommentSchema, Agency, AgencySchema,
  Body, BodySchema,
} from './schemas';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ward.name, schema: WardSchema },
      { name: Complaint.name, schema: ComplaintSchema },
      { name: ComplaintComment.name, schema: ComplaintCommentSchema },
      { name: Agency.name, schema: AgencySchema },
      { name: Body.name, schema: BodySchema },
    ]),
    AuthModule,
  ],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
