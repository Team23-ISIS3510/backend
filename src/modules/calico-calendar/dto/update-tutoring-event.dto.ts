import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateTutoringEventDto {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
