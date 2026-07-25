import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Tiny key/value config store (e.g. the admin-defined home section order).
@Schema({ collection: 'app_config', timestamps: true })
export class AppConfig {
  @Prop({ required: true, unique: true, index: true }) key: string;
  @Prop({ type: Object, default: null }) value: any;
}

export type AppConfigDocument = AppConfig & Document;
export const AppConfigSchema = SchemaFactory.createForClass(AppConfig);
