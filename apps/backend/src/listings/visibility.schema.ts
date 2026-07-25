import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// FAIR VISIBILITY — one doc per (visitor, IST day, pool) recording which listings
// took the prime first-row slots for that visitor that day, and the points they
// earned (pos 1 = 3, pos 2 = 2, pos 3 = 1). Nothing below the first row scores.
//
// It does three jobs at once:
//  • DEDUPE — the unique (visitor_id, day, pool) index means a visitor refreshing
//    the same list all day can't keep inflating a post's visibility.
//  • STABILITY — the stored picks are replayed for that visitor all day, so their
//    first row doesn't reshuffle under them as other people browse.
//  • WINDOW — scores are summed over the last 30 days only, so a post added later
//    doesn't face an unwinnable all-time backlog.
@Schema({ collection: 'visibility', timestamps: false })
export class Visibility {
  @Prop({ required: true, index: true }) visitor_id: string;
  @Prop({ required: true, index: true }) day: string;        // IST YYYY-MM-DD
  @Prop({ required: true }) pool: string;                    // "c:<filter>" or "q:<term>"
  @Prop({ type: [{ listing_id: String, pos: Number, points: Number }], default: [] })
  picks: { listing_id: string; pos: number; points: number }[];
  @Prop({ type: Date, default: Date.now }) ts: Date;
}

export type VisibilityDocument = Visibility & Document;
export const VisibilitySchema = SchemaFactory.createForClass(Visibility);
// One slot-assignment per visitor/day/pool — the dedupe + stability guarantee.
VisibilitySchema.index({ visitor_id: 1, day: 1, pool: 1 }, { unique: true });
// Scoring reads the last 30 days and unwinds picks.
VisibilitySchema.index({ day: 1, 'picks.listing_id': 1 });
