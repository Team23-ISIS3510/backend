import { IsString, IsNotEmpty, IsOptional, IsArray, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTutoringEventDto {
  @ApiProperty({ example: 'Tutoría de Cálculo – María y Juan', description: 'Calendar event title' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiProperty({ example: 'Sesión de cálculo diferencial, capítulo 3.', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2025-06-15T14:00:00-05:00', description: 'ISO 8601 start date-time (Bogotá timezone recommended)' })
  @IsDateString()
  @IsNotEmpty()
  startDateTime: string;

  @ApiProperty({ example: '2025-06-15T15:00:00-05:00', description: 'ISO 8601 end date-time' })
  @IsDateString()
  @IsNotEmpty()
  endDateTime: string;

  @ApiProperty({
    example: ['student@example.com', 'tutor@example.com'],
    required: false,
    type: [String],
    description: 'Attendee email addresses to invite to the Google Calendar event',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];

  @ApiProperty({ example: 'Bogotá, Colombia', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 'tutor@university.edu', description: 'Tutor email (added as attendee and shown in event)' })
  @IsString()
  @IsNotEmpty()
  tutorEmail: string;

  @ApiProperty({ example: 'Juan Pérez', required: false, description: 'Tutor display name in the event' })
  @IsOptional()
  @IsString()
  tutorName?: string;

  @ApiProperty({ example: 'uid_tutor_abc', description: 'Tutor Firebase UID (stored in event metadata)' })
  @IsString()
  @IsNotEmpty()
  tutorId: string;
}
