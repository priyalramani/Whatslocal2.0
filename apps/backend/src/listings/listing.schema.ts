import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'listings', timestamps: true })
export class Listing {
  @Prop({ required: true, index: true, default: 'business' })
  kind: 'business' | 'job_seeker' | 'job_opening';

  @Prop({ required: true, default: 'business', index: true })
  post_type: string;

  @Prop({ required: true, trim: true }) title: string;
  // Readable, unique URL slug derived from the title ("Sharma_General_Store").
  // Stable once set — renaming the listing keeps the original shared link alive.
  @Prop({ type: String, index: true }) slug?: string;

  // SENSITIVE — never projected to public responses. Reveal only via gated endpoint.
  @Prop({ required: true }) mobile: string;
  // Separate CALLING number, when the main number isn't for calls. Blank = calls
  // go to `mobile`. Mirrors how `whatsapp` works for the other channel: the
  // poster gives ONE number and ticks Call / WhatsApp; unticking either opens an
  // optional cell for a different number that serves it. `mobile` stays the
  // poster's own/primary number so ownership, OTP and duplicate detection are
  // unaffected by which channels they offer.
  @Prop({ default: '' }) alt_phone: string;
  // Safe boolean the public CAN see (so the UI shows a "Show number" button)
  // without ever exposing the number itself.
  @Prop({ default: true }) has_phone: boolean;

  @Prop({ required: true, index: true }) pincode: string;
  @Prop({ type: [String], default: [] }) tag_ids: string[];
  // Free-typed keywords (brands/products not in the dictionary).
  @Prop({ type: [String], default: [] }) free_keywords: string[];
  @Prop({ type: String, default: null }) primary_tag_id: string | null;
  @Prop({ default: false }) hide_title: boolean;
  @Prop({ default: '' }) category: string;
  @Prop({ default: '' }) icon: string;
  // Contact-method availability for the number (default both true). Public-safe.
  @Prop({ default: true }) call_ok: boolean;
  @Prop({ default: true }) whatsapp_ok: boolean;
  // When true the number is kept fully private — collected only for OTP/ownership,
  // never exposed publicly (forces has_phone/call_ok/whatsapp_ok off in toPublic
  // and blocks reveal). Used by Happening news/info posts.
  @Prop({ default: false }) hide_number: boolean;

  @Prop({ default: '' }) whatsapp: string;
  @Prop({ default: '' }) address: string;
  @Prop({ type: [String], default: [], index: true }) categories: string[];   // up to 3 (listed in each)
  @Prop({ default: '' }) short_desc: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop({ default: '' }) hours: string;
  @Prop({ default: '' }) email: string;
  @Prop({ default: '' }) website: string;
  @Prop({ type: { lat: Number, lng: Number }, default: null }) location: { lat: number; lng: number } | null;

  @Prop({ default: '', index: true }) city: string;
  @Prop({ default: '' }) district: string;
  @Prop({ default: '' }) state: string;

  // job_seeker
  @Prop({ default: '' }) dob: string;
  @Prop({ type: String, default: null }) gender: string | null;
  @Prop({ type: String, default: null }) marital_status: string | null;
  @Prop({ type: Number, default: null }) experience_months: number | null;
  @Prop({ default: '' }) experience_description: string;

  // shared job field
  @Prop({ default: '' }) job_role: string;
  // job_opening
  @Prop({ default: '' }) job_timing: string;
  @Prop({ default: '' }) working_days: string;
  @Prop({ type: [{ day: String, open: Boolean, from: String, to: String }], default: [] })
  week_hours: { day: string; open: boolean; from: string; to: string }[];
  @Prop({ default: 'both' }) gender_required: string;
  @Prop({ type: [String], default: [] }) off_days: string[];
  @Prop({ type: Number, default: null }) salary_min: number | null;
  @Prop({ type: Number, default: null }) salary_max: number | null;
  @Prop({ type: Number, default: null }) experience_required_months: number | null;
  @Prop({ type: Number, default: null }) age_min: number | null;   // candidate age range (optional)
  @Prop({ type: Number, default: null }) age_max: number | null;
  @Prop({ type: [String], default: [] }) languages: string[];

  // Custom CTA button (user-defined). url is http(s)-only (validated in DTO).
  @Prop({ default: '' }) cta_label: string;
  @Prop({ default: '' }) cta_url: string;
  @Prop({ default: '' }) cta_label2: string;
  @Prop({ default: '' }) cta_url2: string;
  @Prop({ type: Number, default: null }) established_year: number | null;
  // sell / rent
  @Prop({ type: Number, default: null }) price: number | null;
  @Prop({ default: '' }) sale_or_rent: string;
  @Prop({ default: '' }) rent_period: string;   // free text, rent only ("per month")
  @Prop({ default: false }) negotiable: boolean;
  // hiring extras
  @Prop({ type: Number, default: null }) vacancies: number | null;
  @Prop({ default: '' }) job_type: string;
  // seeker extras
  @Prop({ type: Number, default: null }) expected_salary: number | null;
  // happening
  @Prop({ default: '' }) happening_type: string;
  @Prop({ default: '' }) event_date: string;
  // offer (a business's time-bound promotion — "Offers in Gondia")
  @Prop({ default: '' }) offer_text: string;
  @Prop({ default: '' }) offer_valid_till: string;   // free-text date, like event_date

  @Prop({ required: true, default: 'pending', index: true })
  status: 'pending' | 'approved' | 'rejected';
  // Admin can hide an approved listing from users without rejecting it.
  @Prop({ default: true, index: true }) active: boolean;
  // Popularity signal — incremented on each public detail view; used as a
  // search-ranking tie-breaker ("most visited"). Stripped from public output.
  @Prop({ default: 0 }) views: number;
  // Admin override: a pinned listing leads its feed. It sits ABOVE ranking but
  // never above RELEVANCE — a pinned post still has to match the query/category
  // to appear at all, so pinning can't hijack unrelated searches.
  @Prop({ default: false, index: true }) pinned: boolean;

  // ---- metadata / audit ----
  @Prop({ type: String, default: null, index: true }) posted_by_user_id: string | null;
  @Prop({ default: '' }) posted_by_mobile: string;   // poster's own logged-in number
  @Prop({ default: 'web' }) source: 'web' | 'admin';
  @Prop({ type: String, default: null }) approved_by: string | null;
  @Prop({ type: Date, default: null }) approved_at: Date | null;

  // Denormalized text for safe search (title + keyword names/synonyms + description).
  @Prop({ default: '' }) search_blob: string;
  // Same text but lowercased + all spaces/punctuation removed — powers substring
  // matching ("paper"→paperboat, "tooyums"→too+yums). Internal; never public.
  @Prop({ default: '' }) search_norm: string;
  @Prop({ type: [String], default: [] }) keywords_cache: string[];
}

export type ListingDocument = Listing & Document;
export const ListingSchema = SchemaFactory.createForClass(Listing);

// Text index powers search across title, keywords, and description.
ListingSchema.index({ search_blob: 'text', title: 'text' });
// Slug is the public permalink — unique, but only enforced where it's set (old
// rows without a slug are skipped, so the index can build before backfill).
ListingSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
