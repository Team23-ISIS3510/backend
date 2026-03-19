import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetStudentHistoryDto {
  @ApiProperty({ example: 'uid_student_xyz', required: false, description: 'Student Firebase UID' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiProperty({ example: 'student@example.com', required: false, description: 'Student email (alternative to studentId)' })
  @IsString()
  @IsOptional()
  studentEmail?: string;

  @ApiProperty({ example: '2024-01-01', required: false, description: 'Filter sessions from this date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ example: '2024-12-31', required: false, description: 'Filter sessions up to this date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ example: 'ISIS3710', required: false, description: 'Filter by course ID' })
  @IsString()
  @IsOptional()
  course?: string;

  @ApiProperty({ example: 50, required: false, description: 'Maximum number of sessions to return (default 100)' })
  @IsOptional()
  limit?: number;
}
