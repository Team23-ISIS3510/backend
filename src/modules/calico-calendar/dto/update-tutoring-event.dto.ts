import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTutoringEventDto {
  @ApiProperty({ example: 'Tutoría actualizada – Álgebra Lineal', required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ example: 'Nueva descripción de la sesión.', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2025-06-16T10:00:00-05:00', required: false, description: 'ISO 8601 new start date-time' })
  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @ApiProperty({ example: '2025-06-16T11:00:00-05:00', required: false, description: 'ISO 8601 new end date-time' })
  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @ApiProperty({ example: 'Sala de reuniones virtual', required: false })
  @IsOptional()
  @IsString()
  location?: string;
}
