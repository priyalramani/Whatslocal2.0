import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches,
  MaxLength, Min, Max, ArrayMaxSize, ArrayMinSize, IsNumberString,
  registerDecorator, type ValidationOptions, type ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Anti-spam: a character cap still lets someone cram a paragraph of keywords
// into a field to rank for everything. Cap WORDS too — legitimate copy is well
// under these; keyword stuffing is not.
function MaxWords(max: number, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxWords', target: object.constructor, propertyName, constraints: [max], options,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          return String(value).trim().split(/\s+/).filter(Boolean).length <= args.constraints[0];
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be ${args.constraints[0]} words or fewer`;
        },
      },
    });
  };
}

// Edit forms submit untouched optional fields as "" (empty string). @IsOptional
// only skips null/undefined, so a blank "" would otherwise fail @Matches (e.g.
// "whatsapp must match …"). Coerce blank/whitespace-only strings to undefined so
// they're treated as "not provided" instead of an invalid value.
const BlankToUndef = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

const KINDS = ['business', 'job_seeker', 'job_opening', 'happening'] as const;
const POST_TYPES = ['business', 'service', 'ngo', 'sell', 'hiring', 'job_seeker', 'happening', 'other'] as const;

export class CreateListingDto {
  @IsIn(POST_TYPES) post_type: string;

  @IsString() @Length(2, 120) @MaxWords(14) title: string;

  // Verification token for a contact number different from the logged-in user's.
  @IsOptional() @IsString() mobile_token?: string;

  // Indian mobile: 10 digits, optionally +91 / 0 prefix. OPTIONAL here because a
  // poster may give WhatsApp only — the service enforces "at least one of
  // call / WhatsApp".
  @BlankToUndef() @IsOptional()
  @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/, { message: 'mobile must be a valid Indian phone number' })
  mobile?: string;

  @Matches(/^\d{6}$/, { message: 'pincode must be 6 digits' }) pincode: string;

  // Dictionary keywords (chosen tags). Free keywords go in free_keywords.
  // At least one of the two is required (checked in the service); combined ≤ 25.
  @IsOptional() @IsArray() @ArrayMaxSize(25) @IsString({ each: true })
  tag_ids?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(25)
  @Matches(/^[\p{L}\p{N} &-]{1,40}$/u, { each: true, message: 'keywords: letters/numbers/spaces only, no punctuation' })
  @MaxWords(4, { each: true, message: 'each keyword must be 4 words or fewer' })
  free_keywords?: string[];

  @IsOptional() @IsString() @MaxLength(64) primary_tag_id?: string;
  @IsOptional() @IsBoolean() hide_title?: boolean;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() @MaxLength(8) icon?: string;
  @IsOptional() @IsBoolean() call_ok?: boolean;
  @IsOptional() @IsBoolean() whatsapp_ok?: boolean;
  @IsOptional() @IsBoolean() hide_number?: boolean;

  // Optional per-channel numbers. Blank means that channel uses `mobile`.
  @BlankToUndef() @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) whatsapp?: string;
  @BlankToUndef() @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) alt_phone?: string;
  @IsOptional() @IsString() @MaxLength(200) @MaxWords(30) address?: string;
  @IsOptional() @IsString() @MaxLength(80) @MaxWords(14) short_desc?: string;
  @IsOptional() @IsString() @MaxLength(2000) @MaxWords(300) description?: string;
  // Stored as upload keys ("p" + 16 hex), resolved to /media/<key>/{view,thumb}.jpg.
  @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(/^[a-z0-9]{6,40}$/, { each: true, message: 'invalid photo id' }) photos?: string[];
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(20) hours?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;

  // job_seeker
  @BlankToUndef() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dob must be YYYY-MM-DD' }) dob?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsIn(['single', 'married', 'divorced', 'widowed']) marital_status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(900) experience_months?: number;
  @IsOptional() @IsString() @MaxLength(2000) @MaxWords(300) experience_description?: string;

  // shared job field
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(8) job_role?: string;
  // job_opening
  @IsOptional() @IsString() @MaxLength(120) job_timing?: string;
  @IsOptional() @IsString() @MaxLength(80) working_days?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) week_hours?: any[];
  @IsOptional() @IsIn(['both', 'male', 'female']) gender_required?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsString({ each: true }) off_days?: string[];
  @IsOptional() @IsInt() @Min(0) salary_min?: number;
  @IsOptional() @IsInt() @Min(0) salary_max?: number;
  @IsOptional() @IsInt() @Min(0) @Max(900) experience_required_months?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) age_min?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) age_max?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];
  // Custom CTA button — url must be http(s) (blocks javascript:/data: XSS).
  @IsOptional() @IsString() @MaxLength(24) @MaxWords(4) cta_label?: string;
  @BlankToUndef() @IsOptional() @Matches(/^https?:\/\/.+/i, { message: 'Button link must start with http:// or https://' }) @MaxLength(300) cta_url?: string;
  @IsOptional() @IsString() @MaxLength(24) @MaxWords(4) cta_label2?: string;
  @BlankToUndef() @IsOptional() @Matches(/^https?:\/\/.+/i) @MaxLength(300) cta_url2?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) established_year?: number;
  // sell / rent
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsIn(['sale', 'rent']) sale_or_rent?: string;
  @IsOptional() @IsString() @MaxLength(40) rent_period?: string;
  @IsOptional() @IsBoolean() negotiable?: boolean;
  // hiring extras
  @IsOptional() @IsInt() @Min(1) @Max(999) vacancies?: number;
  @IsOptional() @IsIn(['full_time', 'part_time', 'contract', 'internship', 'any']) job_type?: string;
  // seeker extras
  @IsOptional() @IsInt() @Min(0) expected_salary?: number;
  // happening
  @IsOptional() @IsIn(['event', 'news', 'info']) happening_type?: string;
  @IsOptional() @IsString() @MaxLength(60) event_date?: string;
  // offer (business promotion)
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(18) offer_text?: string;
  @IsOptional() @IsString() @MaxLength(60) offer_valid_till?: string;
}

export class SearchQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(40) city?: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @IsIn(['sell', 'other']) post_type?: string;
  @IsOptional() @IsIn(['sale', 'rent']) sale_or_rent?: string;
  // Single label, or a comma-separated set for multi-category browse buckets.
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsNumberString() page?: string;
  // Anonymous device id — powers the fair-visibility rotation (dedupe + stable
  // first row per visitor per day). Not stored on the listing, never PII.
  @IsOptional() @IsString() @MaxLength(64) vid?: string;
  // Job filters (seekers/employers)
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsNumberString() age_min?: string;
  @IsOptional() @IsNumberString() age_max?: string;
  @IsOptional() @IsNumberString() exp_min?: string;
  @IsOptional() @IsNumberString() exp_max?: string;
  @IsOptional() @IsNumberString() sal_min?: string;
  @IsOptional() @IsNumberString() sal_max?: string;
}

export class RevealDto {
  @IsString() @Length(8, 64) visitor_id: string;
}

const REPORT_REASONS = ['spam', 'wrong_info', 'scam', 'duplicate', 'offensive', 'other'] as const;
export class ReportDto {
  @IsIn(REPORT_REASONS) reason: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
  @IsOptional() @IsString() @Length(8, 64) visitor_id?: string;  // login now required; kept optional
}

// Admin edit — all fields optional; only sent ones are changed.
export class AdminUpdateListingDto {
  @IsOptional() @IsIn(POST_TYPES) post_type?: string;
  @IsOptional() @IsString() @Length(2, 120) @MaxWords(14) title?: string;
  @BlankToUndef() @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) mobile?: string;
  @BlankToUndef() @IsOptional() @Matches(/^\d{6}$/) pincode?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(25) @IsString({ each: true }) free_keywords?: string[];
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(8) job_role?: string;
  @IsOptional() @IsBoolean() hide_title?: boolean;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() @MaxLength(8) icon?: string;
  @IsOptional() @IsBoolean() call_ok?: boolean;
  @IsOptional() @IsBoolean() whatsapp_ok?: boolean;
  @IsOptional() @IsBoolean() hide_number?: boolean;
  // Optional per-channel numbers. Blank means that channel uses `mobile`.
  @BlankToUndef() @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) whatsapp?: string;
  @BlankToUndef() @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) alt_phone?: string;
  @IsOptional() @IsString() @MaxLength(200) @MaxWords(30) address?: string;
  @IsOptional() @IsString() @MaxLength(80) @MaxWords(14) short_desc?: string;
  @IsOptional() @IsString() @MaxLength(2000) @MaxWords(300) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(/^[a-z0-9]{6,40}$/, { each: true, message: 'invalid photo id' }) photos?: string[];
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(20) hours?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  // job_seeker
  @BlankToUndef() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dob?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsIn(['single', 'married', 'divorced', 'widowed']) marital_status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(900) experience_months?: number;
  @IsOptional() @IsString() @MaxLength(2000) @MaxWords(300) experience_description?: string;
  // job_opening
  @IsOptional() @IsString() @MaxLength(120) job_timing?: string;
  @IsOptional() @IsString() @MaxLength(80) working_days?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) week_hours?: any[];
  @IsOptional() @IsIn(['both', 'male', 'female']) gender_required?: string;
  @IsOptional() @IsInt() @Min(0) salary_min?: number;
  @IsOptional() @IsInt() @Min(0) salary_max?: number;
  @IsOptional() @IsInt() @Min(0) @Max(900) experience_required_months?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) age_min?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) age_max?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsString() @MaxLength(24) @MaxWords(4) cta_label?: string;
  @BlankToUndef() @IsOptional() @Matches(/^https?:\/\/.+/i) @MaxLength(300) cta_url?: string;
  @IsOptional() @IsString() @MaxLength(24) @MaxWords(4) cta_label2?: string;
  @BlankToUndef() @IsOptional() @Matches(/^https?:\/\/.+/i) @MaxLength(300) cta_url2?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) established_year?: number;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsIn(['sale', 'rent']) sale_or_rent?: string;
  @IsOptional() @IsString() @MaxLength(40) rent_period?: string;
  @IsOptional() @IsBoolean() negotiable?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(999) vacancies?: number;
  @IsOptional() @IsIn(['full_time', 'part_time', 'contract', 'internship', 'any']) job_type?: string;
  @IsOptional() @IsInt() @Min(0) expected_salary?: number;
  @IsOptional() @IsIn(['event', 'news', 'info']) happening_type?: string;
  @IsOptional() @IsString() @MaxLength(60) event_date?: string;
  @IsOptional() @IsString() @MaxLength(120) @MaxWords(18) offer_text?: string;
  @IsOptional() @IsString() @MaxLength(60) offer_valid_till?: string;
}
