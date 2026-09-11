import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A browser's Web Push subscription. One row per device/browser (keyed by the
// push endpoint). visitor_id ties it to analytics; user_id is filled on login so
// the send side (built later) can target a person. keys{p256dh,auth} + endpoint
// are what the send side needs to encrypt + deliver a push.
@Schema({ collection: 'push_subscriptions', timestamps: true })
export class PushSubscription {
  @Prop({ required: true, unique: true, index: true }) endpoint: string;
  @Prop({ type: Object, default: {} }) keys: { p256dh?: string; auth?: string };
  @Prop({ default: '', index: true }) visitor_id: string;
  @Prop({ type: String, default: null, index: true }) user_id: string | null;
  // True only when this device subscribed while authenticated as an ADMIN (role
  // verified server-side). The new-post alert targets ONLY these. Cleared/removed
  // on logout so a logged-out device never receives admin pushes.
  @Prop({ default: false, index: true }) admin: boolean;
  @Prop({ default: '' }) role: string;
  @Prop({ default: '' }) city: string;
  @Prop({ default: '' }) ua: string;
}
export type PushSubscriptionDocument = PushSubscription & Document;
export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
