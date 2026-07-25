import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A municipal ward + its elected members. A ward can have MULTIPLE members; each
// is identified at action-time by matching their logged-in mobile to one of the
// members' mobiles (that's the "verified account" — no separate linking step).
// Members' mobiles are used only for the call/WhatsApp contact button — never
// shown as a listed number for regular users.
@Schema({ collection: 'wards', timestamps: true })
export class Ward {
  @Prop({ required: true, index: true }) number: number;
  @Prop({ default: '' }) name: string;            // area / locality name
  @Prop({ default: '' }) address: string;         // ward address
  @Prop({ type: [{ name: String, mobile: String }], default: [] }) members: { name: string; mobile: string }[];
  @Prop({ default: '' }) photo: string;
  @Prop({ default: 'Gondia', index: true }) city: string;
  // A ward belongs to ONE body (a municipal town OR a gram panchayat), which
  // sits under a taluka. Ward numbers are unique per (city, body) — Gondia ward 1
  // and Tirora ward 1 are different wards. See COMPLAINTS.md.
  @Prop({ default: 'Gondia', index: true }) body: string;
  @Prop({ default: 'Gondia' }) taluka: string;
  @Prop({ default: 'municipal' }) body_type: string;   // municipal | gram_panchayat
  @Prop({ default: true }) active: boolean;
}
export type WardDocument = Ward & Document;
export const WardSchema = SchemaFactory.createForClass(Ward);

// A local body: a municipal town (Nagar Parishad/Panchayat) or a gram panchayat
// (village). Holds the pincode(s) that route a resident to it. Wards reference it
// by `name`. Grouped by `taluka` under the app-level `city` (district).
@Schema({ collection: 'bodies', timestamps: true })
export class Body {
  @Prop({ required: true, index: true }) name: string;
  @Prop({ default: 'municipal' }) type: string;        // municipal | gram_panchayat
  @Prop({ default: '' }) taluka: string;
  @Prop({ default: 'Gondia', index: true }) city: string;
  @Prop({ type: [String], default: [] }) pincodes: string[];
  @Prop({ default: true }) active: boolean;
}
export type BodyDocument = Body & Document;
export const BodySchema = SchemaFactory.createForClass(Body);

// A civic complaint. status doubles as the disposition (see COMPLAINTS.md):
// pending→open→in_progress→{resolved|rejected|forwarded|reassigned|on_hold|
// duplicate|need_info|scheduled|escalated|legal}. Non-resolved dispositions
// carry a public `reason`; some carry an agency / expected_date / duplicate_of.
@Schema({ collection: 'complaints', timestamps: true })
export class Complaint {
  @Prop({ required: true, index: true }) ward: number;      // ward number (within its body)
  @Prop({ default: 'Gondia', index: true }) body: string;   // which body's ward
  @Prop({ default: 'Gondia' }) taluka: string;
  @Prop({ default: '' }) category: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop({ default: '' }) area: string;
  @Prop({ default: 'Gondia', index: true }) city: string;
  @Prop({ required: true, index: true }) poster_user_id: string;
  @Prop({ default: '' }) poster_name: string;              // shown (decision #1)
  @Prop({ default: '' }) poster_mobile: string;            // owner checks only, never shown
  @Prop({ default: 'pending', index: true }) status: string;
  @Prop({ default: '' }) reason: string;                   // official note for the disposition
  @Prop({ default: '' }) expected_date: string;            // on_hold / scheduled
  @Prop({ default: '' }) agency: string;                   // forwarded → agency name
  @Prop({ type: String, default: null }) duplicate_of: string | null;
  @Prop({ default: false }) disputed: boolean;
  @Prop({ type: Date, default: null }) resolved_at: Date | null;
  @Prop({ type: [String], default: [] }) likes: string[];   // user ids who liked ("me too")
  @Prop({ default: 0 }) shares: number;                     // share taps (loose tally)
}
export type ComplaintDocument = Complaint & Document;
export const ComplaintSchema = SchemaFactory.createForClass(Complaint);

// A comment on a complaint. author_role badges official responses; resident
// comments are 'pending' until admin-approved, member/admin ones auto-approved.
@Schema({ collection: 'complaint_comments', timestamps: true })
export class ComplaintComment {
  @Prop({ required: true, index: true }) complaint_id: string;
  @Prop({ required: true }) author_user_id: string;
  @Prop({ default: '' }) author_name: string;
  @Prop({ default: 'public' }) author_role: string;        // public | ward_member | admin
  @Prop({ default: '' }) text: string;
  @Prop({ default: 'pending', index: true }) status: string; // pending | approved | hidden
}
export type ComplaintCommentDocument = ComplaintComment & Document;
export const ComplaintCommentSchema = SchemaFactory.createForClass(ComplaintComment);

// External departments a complaint can be forwarded to (decision-model). Seeded
// with the common Gondia agencies; helpline is shown to the citizen.
@Schema({ collection: 'agencies', timestamps: true })
export class Agency {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) helpline: string;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: true }) active: boolean;
}
export type AgencyDocument = Agency & Document;
export const AgencySchema = SchemaFactory.createForClass(Agency);
