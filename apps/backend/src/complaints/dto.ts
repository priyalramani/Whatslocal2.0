import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, ArrayMaxSize } from 'class-validator';

export const COMPLAINT_CATEGORIES = [
  'water', 'drainage', 'road', 'streetlight', 'garbage', 'electricity',
  'stray', 'encroachment', 'sanitation', 'trees', 'other',
] as const;

// The statuses a ward member / admin can set. The ward-member panel offers
// in_progress / closed ("can't take up") / resolved ("mark done"); admin can
// also flip open/rejected. 'closed' requires a public reason (checked in svc).
export const SETTABLE_STATUSES = [
  'in_progress', 'closed', 'resolved', 'open', 'rejected',
] as const;

export class CreateComplaintDto {
  @IsInt() ward: number;
  // Which body the ward belongs to (town / gram panchayat). Defaults to the
  // city's main town server-side when omitted (back-compat for Gondia).
  @IsOptional() @IsString() @MaxLength(80) body?: string;
  @IsIn(COMPLAINT_CATEGORIES as unknown as string[]) category: string;
  @IsString() @Length(4, 120) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) photos?: string[];
  @IsOptional() @IsString() @MaxLength(120) area?: string;
  // Required the first time — the resident's display name (shown, per decision #1).
  @IsOptional() @IsString() @MaxLength(60) name?: string;
}

export class CommentDto {
  @IsString() @Length(1, 1000) text: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
}

export class SetStatusDto {
  @IsIn(SETTABLE_STATUSES as unknown as string[]) status: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class WardDto {
  @IsInt() number: number;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) members?: { name?: string; mobile?: string }[];
  @IsOptional() @IsString() @MaxLength(80) photo?: string;
  @IsOptional() @IsString() @MaxLength(40) city?: string;
  // Which body + taluka this ward belongs to (Gondia town, Tirora town, …).
  @IsOptional() @IsString() @MaxLength(80) body?: string;
  @IsOptional() @IsString() @MaxLength(80) taluka?: string;
  @IsOptional() @IsIn(['municipal', 'gram_panchayat']) body_type?: string;
  @IsOptional() active?: boolean;
}

export class BodyDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsIn(['municipal', 'gram_panchayat']) type?: string;
  @IsOptional() @IsString() @MaxLength(80) taluka?: string;
  @IsOptional() @IsString() @MaxLength(40) city?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) pincodes?: string[];
  @IsOptional() active?: boolean;
}

export class RejectDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
