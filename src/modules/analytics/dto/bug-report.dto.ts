import { IsEnum, IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

/**
 * BQ1: DTO for creating bug reports from mobile app
 */
export class CreateBugReportDto {
  @IsEnum(['CRASH', 'BUG', 'LATENCY'])
  @IsNotEmpty()
  type!: 'CRASH' | 'BUG' | 'LATENCY';

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsOptional()
  deviceModel?: string;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
