import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A TRIP is a one-way cab seat/car offered by a commercial operator for a
// specific date + time window ("गोंदिया से नागपुर, सुबह 7 से दोपहर 3, एक तरफ
// किराए में"). Unlike every other post on WhatsLocal it is PERISHABLE — it dies
// at `expires_at`, so nothing here is ever evergreen.
@Schema({ collection: 'trips', timestamps: true })
export class Trip {
  // Route
  @Prop({ required: true, trim: true, index: true }) from_city: string;
  @Prop({ required: true, trim: true, index: true }) to_city: string;
  @Prop({ default: '' }) via: string;

  // When (IST). `date` is the travel day; the window is local HH:mm text.
  @Prop({ required: true, index: true }) date: string;       // YYYY-MM-DD
  @Prop({ default: '' }) time_from: string;                  // "07:00"
  @Prop({ default: '' }) time_to: string;                    // "15:00"
  // Auto-hide point — every query filters on this, so no cron is needed.
  @Prop({ required: true, index: true }) expires_at: Date;
  // RECURRING = a commercial operator who runs this route EVERY day (Jay Appaji,
  // Banewar). These are businesses, not a one-off seat, so they must NOT expire
  // — `expires_at` is set far in the future and the daily sweep skips them. The
  // shown "date" rolls to today on read so it never looks stale. A one-off
  // shared seat stays recurring:false and perishes as before.
  @Prop({ default: false, index: true }) recurring: boolean;

  // Vehicle / commercial terms
  @Prop({ default: '' }) vehicle: string;                    // Dizire / Ertiga / …
  @Prop({ type: Number, default: null }) seats: number | null;
  @Prop({ type: Number, default: null }) fare: number | null; // null = "call for price"
  @Prop({ default: true }) one_way: boolean;                 // the whole pitch
  @Prop({ default: '', maxlength: 300 }) note: string;

  // Operator (commercial only — v1 has no private carpooling)
  @Prop({ default: '', trim: true }) operator_name: string;
  @Prop({ required: true }) mobile: string;
  @Prop({ default: '' }) whatsapp: string;

  // Ownership + moderation. Trips publish immediately (an approval queue would
  // make a 7am cab useless by the time it's live); admin can hide instead.
  @Prop({ index: true }) posted_by_user_id: string;
  @Prop({ default: '' }) posted_by_mobile: string;
  @Prop({ default: true, index: true }) active: boolean;
  @Prop({ default: '', index: true }) city: string;          // posting city
}

export type TripDocument = Trip & Document;
export const TripSchema = SchemaFactory.createForClass(Trip);
// The one hot query: live trips on a route, soonest first.
TripSchema.index({ expires_at: 1, from_city: 1, to_city: 1, date: 1 });
