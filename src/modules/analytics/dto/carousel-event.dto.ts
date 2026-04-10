import { IsEnum, IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString } from 'class-validator';

/**
 * BQ2: DTO for carousel interaction events from the Flutter app.
 * Events: results_shown, tutor_clicked, booking_completed
 */
export class CreateCarouselEventDto {
  @IsEnum(['results_shown', 'tutor_clicked', 'booking_completed'])
  @IsNotEmpty()
  event!: 'results_shown' | 'tutor_clicked' | 'booking_completed';

  @IsString()
  @IsNotEmpty()
  courseId!: string;

  @IsString()
  @IsOptional()
  tutorId?: string;

  @IsNumber()
  @IsOptional()
  tutorRating?: number;

  @IsNumber()
  @IsOptional()
  resultCount?: number;

  @IsNumber()
  @IsOptional()
  countdownMinutes?: number;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
