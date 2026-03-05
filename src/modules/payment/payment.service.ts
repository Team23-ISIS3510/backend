import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentRepository } from './payment.repository';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreateWompiPaymentDto } from './dto/create-wompi-payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly configService: ConfigService,
  ) {}

  async getPaymentById(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(id);

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  async createPayment(paymentData: Partial<Payment>): Promise<Payment> {
    if (!paymentData.courseId) {
      throw new BadRequestException('courseId is required for payment creation');
    }

    const id = await this.paymentRepository.save(paymentData.id, paymentData);
    return this.getPaymentById(id);
  }

  async updatePayment(id: string, paymentData: Partial<Payment>): Promise<Payment> {
    await this.paymentRepository.save(id, paymentData);
    return this.getPaymentById(id);
  }

  async getPaymentsByTutor(tutorId: string, limit: number = 50): Promise<Payment[]> {
    return this.paymentRepository.findByTutor(tutorId, limit);
  }

  async getPaymentsByStudent(studentId: string, limit: number = 50): Promise<Payment[]> {
    return this.paymentRepository.findByStudent(studentId, limit);
  }

  async handleWompiWebhook(event: any): Promise<void> {
    const { data, signature, timestamp } = event ?? {};
    const transaction = data?.transaction;

    if (!transaction) {
      throw new BadRequestException('Invalid webhook payload: transaction data missing');
    }

    const integritySecret = this.configService.get<string>('WOMPI_INTEGRITY_SECRET');
    if (!integritySecret) {
      this.logger.error('WOMPI_INTEGRITY_SECRET not configured');
      throw new Error('Server configuration error');
    }

    const properties: string[] = signature?.properties ?? [];
    let concatenatedString = '';

    for (const prop of properties) {
      const parts = prop.split('.');
      let value = data;

      for (const part of parts) {
        value = value?.[part];
      }

      concatenatedString += value ?? '';
    }

    concatenatedString += timestamp;
    concatenatedString += integritySecret;

    const calculatedChecksum = crypto.createHash('sha256').update(concatenatedString).digest('hex');

    if (calculatedChecksum !== signature?.checksum) {
      this.logger.warn(
        `Invalid Wompi signature. Calculated: ${calculatedChecksum}, Received: ${signature?.checksum}`,
      );
      throw new BadRequestException('Invalid signature');
    }

    const paymentId = transaction.reference;
    const wompiStatus = transaction.status;

    let paymentStatus: PaymentStatus;
    switch (wompiStatus) {
      case 'APPROVED':
        paymentStatus = 'paid';
        break;
      case 'DECLINED':
      case 'ERROR':
        paymentStatus = 'failed';
        break;
      case 'VOIDED':
        paymentStatus = 'refunded';
        break;
      default:
        paymentStatus = 'pending';
        break;
    }

    try {
      await this.updatePayment(paymentId, {
        status: paymentStatus,
        wompiTransactionId: transaction.id,
        paymentMethod: transaction.payment_method_type,
        updatedAt: new Date(),
      });

      this.logger.log(`Payment ${paymentId} updated to ${paymentStatus} via Wompi webhook`);
    } catch (error) {
      this.logger.error(`Failed to update payment ${paymentId} from webhook`, error);
    }
  }

  async createWompiPayment(paymentData: CreateWompiPaymentDto): Promise<{
    reference: string;
    amount: number;
    currency: string;
    publicKey: string;
    signature: string;
  }> {
    const publicKey = this.configService.get<string>('NEXT_PUBLIC_WOMPI_PUBLIC_KEY');
    const integritySecret = this.configService.get<string>('WOMPI_INTEGRITY_SECRET');

    if (!publicKey || !integritySecret) {
      throw new Error('Wompi keys are not configured in the environment variables');
    }

    const reference = `payment_${Date.now()}`;

    await this.createPayment({
      ...paymentData,
      status: 'pending',
      createdAt: new Date(),
      id: reference,
    });

    const concatenatedString = `${reference}${paymentData.amount}${paymentData.currency}${integritySecret}`;
    const signature = crypto.createHash('sha256').update(concatenatedString).digest('hex');

    return {
      reference,
      amount: paymentData.amount,
      currency: paymentData.currency,
      publicKey,
      signature,
    };
  }
}
