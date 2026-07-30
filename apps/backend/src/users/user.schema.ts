import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserRole = 'admin' | 'user';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  // OTP users have no password; admins do.
  @Prop({ default: '' })
  password_hash: string;

  // For OTP users, the verified mobile (also used as username).
  @Prop({ default: '', index: true })
  mobile: string;

  @Prop({ required: true, default: 'user', index: true })
  role: UserRole;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: true })
  active: boolean;

  // Admin can restrict a user (e.g. after abuse): blocks posting & reporting.
  @Prop({ default: false })
  blocked: boolean;

  // Self-reported gender ('male' | 'female' | 'other'), collected once via the
  // gender prompt. Mirrored from the per-device visitor_profiles row on save so
  // it's a first-class account attribute. Empty = not yet answered.
  @Prop({ default: '' })
  gender: string;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
