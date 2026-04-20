import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendEmergencyAlertEmailDto {
  @ApiProperty({
    description: 'Emergency contact email that will receive the alert',
    example: 'alerta.tutor@example.com',
  })
  @IsEmail()
  toEmail!: string;

  @ApiProperty({
    description: 'Emergency contact display name',
    example: 'Tutor de guardia',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toName?: string;

  @ApiProperty({
    description: 'Student/user name who triggered the alert',
    example: 'Juan Perez',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  studentName!: string;

  @ApiProperty({
    description: 'Human-readable details of detected movement/risk context',
    example: 'Se detectaron 8 movimientos bruscos en los ultimos 30 segundos.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  alertReason!: string;

  @ApiProperty({
    description: 'Approximate location or custom context string',
    example: 'Cra 15 #93-45, Bogota',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  location?: string;
}
