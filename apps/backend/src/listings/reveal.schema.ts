import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One row per phone reveal — used to meter/limit reveals per visitor per day.
@Schema({ collection: 'reveals', timestamps: false })
export class Reveal {
  @Prop({ required: true, index: true }) visitor_id: string;
  @Prop({ type: String, default: null }) user_id: string | null;
  @Prop({ required: true }) listing_id: string;
  @Prop({ required: true, index: true }) day: string; // YYYY-MM-DD
  @Prop({ required: true }) ts: Date;
  @Prop({ default: '' }) ip: string;
}

export type RevealDocument = Reveal & Document;
export const RevealSchema = SchemaFactory.createForClass(Reveal);
RevealSchema.index({ visitor_id: 1, day: 1 });
