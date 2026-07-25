import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Cached India Post pincode → city/district/state resolution. The mapping is
// effectively immutable, so this is a permanent read-through cache: once a pin
// is resolved (by a user or the Gondia pre-warm) it's served from here forever,
// and India Post is only ever hit for a pin we've never seen. See DATABASE.md.
@Schema({ collection: 'pincodes', timestamps: true })
export class Pincode {
  @Prop({ required: true, unique: true, index: true }) pin: string;
  @Prop({ default: '' }) city: string;
  @Prop({ default: '' }) district: string;
  @Prop({ default: '' }) state: string;
  @Prop({ type: [String], default: [] }) localities: string[];
}
export type PincodeDocument = Pincode & Document;
export const PincodeSchema = SchemaFactory.createForClass(Pincode);
