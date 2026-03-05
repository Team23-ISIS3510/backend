import { IsString, IsNotEmpty, IsOptional, IsArray, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AttendeeDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  responseStatus?: string;
}

export class CreateTutoringEventDto {
  @IsString()
  @IsNotEmpty()
  summary: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  @IsNotEmpty()
  startDateTime: string;

  @IsDateString()
  @IsNotEmpty()
  endDateTime: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsString()
  @IsNotEmpty()
  tutorEmail: string;

  @IsOptional()
  @IsString()
  tutorName?: string;

  @IsString()
  @IsNotEmpty()
  tutorId: string;
}
