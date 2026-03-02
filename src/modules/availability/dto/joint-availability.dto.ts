import { IsString, IsNotEmpty, IsOptional, IsArray, IsDateString, IsNumber, Min } from 'class-validator';

export class GetMultipleTutorsAvailabilityDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  tutorIds: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class GenerateJointSlotsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  tutorIds: string[];

  @IsDateString()
  @IsNotEmpty()
  date: string;
}

export class GenerateJointSlotsWeekDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  tutorIds: string[];

  @IsDateString()
  @IsNotEmpty()
  startDate: string;
}

export class GetJointAvailabilityStatsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  tutorIds: string[];
}
