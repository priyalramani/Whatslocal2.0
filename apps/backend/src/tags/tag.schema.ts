import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'tags', timestamps: true })
export class Tag {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) slug: string;
  @Prop({ type: [String], default: [] }) synonyms: string[];
  @Prop({ required: true, default: 'business', index: true })
  kind: 'business' | 'job';
  @Prop({ default: '' }) group: string;
  @Prop({ default: false, index: true }) approved: boolean;
  @Prop({ default: 0 }) sort_order: number;
}

export type TagDocument = Tag & Document;
export const TagSchema = SchemaFactory.createForClass(Tag);
