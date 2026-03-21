import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '../entities/payment.entity';

export class UpdatePaymentDto {
  @ApiProperty({
    enum: ['pending', 'paid', 'failed', 'refunded'],
    example: 'paid',
    required: false,
    description: 'New payment status',
  })
  @IsIn(['pending', 'paid', 'failed', 'refunded'])
  @IsOptional()
  status?: 'pending' | 'paid' | 'failed' | 'refunded';

  @ApiProperty({ example: 'wompi_abc123', required: false, description: 'Wompi transaction ID from the webhook' })
  @IsString()
  @IsOptional()
  wompiTransactionId?: string;

  @ApiProperty({ example: 'CARD', required: false, description: 'Payment method used' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
