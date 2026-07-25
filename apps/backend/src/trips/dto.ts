import { IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, Max, IsBoolean } from 'class-validator';

export const VEHICLES = ['Dzire', 'Ertiga', 'Innova', 'Bolero', 'Scorpio', 'Tempo', 'Bus', 'Other'] as const;

export class CreateTripDto {
  @IsString() @Length(2, 40) from_city: string;
  @IsString() @Length(2, 40) to_city: string;
  @IsOptional() @IsString() @MaxLength(60) via?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time_from must be HH:mm' }) time_from?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time_to must be HH:mm' }) time_to?: string;

  @IsOptional() @IsIn(VEHICLES) vehicle?: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) seats?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) fare?: number;
  @IsOptional() @IsBoolean() one_way?: boolean;
  // A daily commercial operator (not a one-off seat). When true the trip never
  // expires and its shown date rolls to today.
  @IsOptional() @IsBoolean() recurring?: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;

  // Optional — plenty of real posts carry only a phone number, no travels name.
  @IsOptional() @IsString() @MaxLength(60) operator_name?: string;
  @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/, { message: 'mobile must be a valid Indian phone number' }) mobile: string;
  @IsOptional() @Matches(/^(?:\+?91|0)?[6-9]\d{9}$/) whatsapp?: string;
  @IsOptional() @IsString() @MaxLength(40) city?: string;
}

// One-tap repeat: same trip, new date (operators run the same routes daily).
export class RepostTripDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time_from?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time_to?: string;
}
