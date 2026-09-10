import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One row per WhatsApp message — the history behind the admin WhatsApp report.
// Outbound rows (what we sent) accumulate a delivery lifecycle; inbound rows are
// the poster's replies. `number` is the counterpart's mobile (91-prefixed) for
// BOTH directions, so grouping by `number` gives the per-number conversation.
@Schema({ collection: 'whatsapp_messages', timestamps: true })
export class WhatsappMessage {
  @Prop({ required: true }) direction: 'out' | 'in';
  @Prop({ default: '', index: true }) number: string; // recipient (out) / sender (in), 91XXXXXXXXXX
  @Prop({ default: '' }) name: string; // business/poster name, for display
  @Prop({ default: '' }) event: string; // 'post_approved' | 'contact_alert' | 'reply'
  @Prop({ default: '' }) template: string;
  @Prop({ default: '' }) lang: string;
  @Prop({ default: '' }) body: string; // the RESOLVED message text (placeholders filled)
  @Prop({ type: [String], default: [] }) buttons: string[];
  @Prop({ default: '', index: true }) wa_id: string; // provider message id (out) / inbound id (in)
  @Prop({ default: '', index: true }) context_id: string; // in: the outbound wa_id it replied to
  @Prop({ type: String, default: null }) listing_id: string | null;
  @Prop({ default: '' }) reply_choice: string; // in: 'yes' | 'no' (when a contact-alert reply)
  // Outbound delivery lifecycle.
  @Prop({ default: 'sent' }) status: string; // sent | delivered | read | failed
  @Prop({ type: Date, default: null }) delivered_at: Date | null;
  @Prop({ type: Date, default: null }) read_at: Date | null;
  @Prop({ type: Date, default: null }) failed_at: Date | null;
  @Prop({ default: '' }) error: string;
}

export type WhatsappMessageDocument = WhatsappMessage & Document;
export const WhatsappMessageSchema = SchemaFactory.createForClass(WhatsappMessage);
WhatsappMessageSchema.index({ number: 1, createdAt: -1 });
