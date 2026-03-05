import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min } from 'class-validator';

export class GenerateSlotsDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class GenerateSlotsFromAvailabilitiesDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  availabilityIds: string[];
}

export class ValidateSlotDto {
  @IsString()
  @IsNotEmpty()
  slotId: string;

  @IsString()
  @IsNotEmpty()
  parentAvailabilityId: string;

  @IsNumber()
  @IsNotEmpty()
  slotIndex: number;
}

export class CheckSlotAvailabilityDto {
  @IsString()
  @IsNotEmpty()
  slotId: string;

  @IsString()
  @IsNotEmpty()
  parentAvailabilityId: string;

  @IsNumber()
  @IsNotEmpty()
  slotIndex: number;

  @IsString()
  @IsNotEmpty()
  tutorId: string;
}

export class GetConsecutiveSlotsDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @IsNumber()
  @Min(1)
  count: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
