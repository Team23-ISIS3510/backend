import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class CheckEventDto {
  @IsString()
  eventId: string;
}

export class SyncAvailabilityDto {
  @IsString()
  tutorId: string;

  @IsOptional()
  @IsString()
  calendarId: string;
}

export class SyncSpecificEventsDto {
  @IsString()
  tutorId: string;

  @IsOptional()
  events?: any[];
}
