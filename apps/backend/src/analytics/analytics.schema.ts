import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'events', timestamps: false })
export class AnalyticsEvent {
  @Prop({ required: true, index: true }) ts: Date;
  @Prop({ required: true, index: true }) type: string;
  @Prop({ required: true, index: true }) visitor_id: string;
  @Prop({ required: true }) session_id: string;
  @Prop({ type: String, default: null }) user_id: string | null;
  @Prop({ default: '' }) path: string;
  @Prop({ default: '' }) referrer: string;
  @Prop({ type: String, default: null }) city: string | null;
  @Prop({ type: String, default: null }) pincode: string | null;
  @Prop({ type: String, default: null, index: true }) query: string | null;
  @Prop({ type: Number, default: null }) result_count: number | null;
  @Prop({ type: String, default: null }) listing_id: string | null;
  @Prop({ type: String, default: null }) target: string | null;
  // Vertical + category of the viewed/acted listing (personalization signal).
  @Prop({ type: String, default: null }) vertical: string | null;
  @Prop({ type: String, default: null }) category: string | null;
  @Prop({ type: Number, default: null }) duration_ms: number | null;
  @Prop({ type: String, default: null }) lang: string | null;
  @Prop({ type: Object, default: {} }) device: Record<string, any>;
  @Prop({ default: '' }) ip: string;
}

export type AnalyticsEventDocument = AnalyticsEvent & Document;
export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);
