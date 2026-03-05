import { IsOptional, IsString, IsNumber, Min, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetAvailabilityDto {
  @IsOptional()
  @IsString()
  tutorId?: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;
}
