import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';

/**
 * BQ15: DTO for logging homepage load time telemetry from the mobile app
 */
export class LogHomepageLoadDto {
  @IsNumber()
  @Min(0)
  load_time_ms!: number;

  @IsEnum(['online', 'offline'])
  connectivity_status!: 'online' | 'offline';

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
