import { IsString, IsOptional, IsDateString } from 'class-validator';

export class GetStudentHistoryDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  studentEmail?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  course?: string;

  @IsOptional()
  limit?: number;
}

