import { PaymentStatus } from '../entities/payment.entity';

export class UpdatePaymentDto {
  status?: PaymentStatus;
  wompiTransactionId?: string;
  paymentMethod?: string;
}
