import { IsString, IsNumber, IsOptional, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWompiPaymentDto {
  @ApiProperty({ example: 'session_doc_id', description: 'Tutoring session ID linked to this payment' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: 'uid_tutor_abc', description: 'Tutor Firebase UID' })
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @ApiProperty({ example: 'uid_student_xyz', required: false, description: 'Student Firebase UID' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiProperty({ example: 'ISIS3710', description: 'Course ID' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 5000000, description: 'Amount in the smallest currency unit (e.g. COP centavos → 50 000 COP = 5 000 000)' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'COP', description: 'ISO 4217 currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 'CARD', required: false, description: 'Wompi payment method type (CARD, PSE, NEQUI, etc.)' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
