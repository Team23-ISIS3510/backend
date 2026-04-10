import { IsEnum, IsString, IsNotEmpty, IsOptional, IsDateString, IsNumber } from 'class-validator';

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

  @IsString()
  @IsOptional()
  feature?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  networkType?: string;

  @IsString()
  @IsOptional()
  endpoint?: string;

  @IsNumber()
  @IsOptional()
  durationMs?: number;

  @IsString()
  @IsOptional()
  method?: string;

  @IsNumber()
  @IsOptional()
  statusCode?: number;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
