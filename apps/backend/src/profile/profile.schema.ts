import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One lightweight profile row per DEVICE (visitor_id), created the first time a
// visitor answers a profile question. Deliberately NOT tied to an account —
// anonymous visitors get one too (WhatsLocal already keys all activity by
// visitor_id). When the visitor later logs in, `user_id` is stamped here and the
// value is mirrored onto their User doc, so the answer follows the account.
@Schema({ collection: 'visitor_profiles', timestamps: true })
export class VisitorProfile {
  @Prop({ required: true, unique: true, index: true }) visitor_id: string;
  @Prop({ type: String, default: null, index: true }) user_id: string | null;
  @Prop({ default: '' }) gender: string;   // 'male' | 'female' | 'other'
}

export type VisitorProfileDocument = VisitorProfile & Document;
export const VisitorProfileSchema = SchemaFactory.createForClass(VisitorProfile);
