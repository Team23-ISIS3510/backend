import { IsString, IsNumber, IsOptional, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uid_tutor_abc', description: 'Tutor Firebase UID' })
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @ApiProperty({ example: 'uid_student_xyz', description: 'Student Firebase UID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: 'ISIS3710', description: 'Course ID (required)' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 50000, description: 'Payment amount in the smallest currency unit (e.g. COP cents)' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'COP', description: 'ISO 4217 currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 'session_doc_id', required: false, description: 'Related tutoring session ID' })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiProperty({ example: 'Payment for 2 hours of calculus tutoring', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
