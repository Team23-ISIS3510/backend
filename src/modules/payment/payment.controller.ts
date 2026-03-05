import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateWompiPaymentDto } from './dto/create-wompi-payment.dto';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Get(':id')
  async getPaymentById(@Param('id') id: string) {
    try {
      const payment = await this.paymentService.getPaymentById(id);
      return { success: true, payment };
    } catch (error) {
      this.logger.error(`Error getting payment ${id}:`, error);
      const message = error instanceof Error ? error.message : 'Payment not found';
      throw new HttpException(message, HttpStatus.NOT_FOUND);
    }
  }

  @Get('tutor/:tutorId')
  async getPaymentsByTutor(
    @Param('tutorId') tutorId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? Number.parseInt(limit, 10) : 50;
      const payments = await this.paymentService.getPaymentsByTutor(
        tutorId,
        limitNum,
      );
      return { success: true, payments, count: payments.length };
    } catch (error) {
      this.logger.error(`Error getting payments for tutor ${tutorId}:`, error);
      const message =
        error instanceof Error
          ? error.message
          : 'Error getting payments by tutor';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('student/:studentId')
  async getPaymentsByStudent(
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? Number.parseInt(limit, 10) : 50;
      const payments = await this.paymentService.getPaymentsByStudent(
        studentId,
        limitNum,
      );
      return { success: true, payments, count: payments.length };
    } catch (error) {
      this.logger.error(
        `Error getting payments for student ${studentId}:`,
        error,
      );
      const message =
        error instanceof Error
          ? error.message
          : 'Error getting payments by student';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async createPayment(@Body() paymentData: CreatePaymentDto) {
    try {
      const payment = await this.paymentService.createPayment(paymentData);
      return { success: true, payment };
    } catch (error) {
      this.logger.error('Error creating payment:', error);
      const message =
        error instanceof Error ? error.message : 'Error creating payment';
      throw new HttpException(
        message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  async updatePayment(
    @Param('id') id: string,
    @Body() paymentData: UpdatePaymentDto,
  ) {
    try {
      const payment = await this.paymentService.updatePayment(id, paymentData);
      return { success: true, payment };
    } catch (error) {
      this.logger.error(`Error updating payment ${id}:`, error);
      const message =
        error instanceof Error ? error.message : 'Error updating payment';
      throw new HttpException(
        message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('wompi/webhook')
  async handleWompiWebhook(@Body() event: any) {
    try {
      await this.paymentService.handleWompiWebhook(event);
      return { success: true };
    } catch (error) {
      this.logger.error('Error processing Wompi webhook:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('wompi/create')
  async createWompiPayment(@Body() paymentData: CreateWompiPaymentDto) {
    try {
      const wompiResponse =
        await this.paymentService.createWompiPayment(paymentData);
      return { success: true, wompiResponse };
    } catch (error) {
      this.logger.error('Error creating Wompi payment:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Error creating Wompi payment';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
