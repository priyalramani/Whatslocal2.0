import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A user-submitted report against a listing (for admin review).
@Schema({ collection: 'reports', timestamps: true })
export class Report {
  @Prop({ required: true, index: true }) listing_id: string;
  @Prop({ required: true }) reason: string;          // spam | wrong_info | scam | duplicate | offensive | other
  @Prop({ default: '' }) details: string;
  @Prop({ default: '' }) visitor_id: string;
  @Prop({ type: String, default: null, index: true }) user_id: string | null;  // reporter (login required)
  @Prop({ default: '' }) reporter_mobile: string;     // snapshot for admin display
  @Prop({ required: true, default: 'open', index: true }) status: 'open' | 'reviewed';
  @Prop({ default: '' }) ip: string;
}

export type ReportDocument = Report & Document;
export const ReportSchema = SchemaFactory.createForClass(Report);
