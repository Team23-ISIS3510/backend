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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateWompiPaymentDto } from './dto/create-wompi-payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @ApiOperation({ summary: 'Get all payments', description: 'Returns all payment records. Optional limit query param.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of results (default 100)', example: '50' })
  @ApiResponse({ status: 200, description: 'List of payments.' })
  @Get()
  async getAllPayments(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? Number.parseInt(limit, 10) : 100;
      const payments = await this.paymentService.getAllPayments(limitNum);
      return { success: true, payments, count: payments.length };
    } catch (error) {
      this.logger.error('Error getting all payments:', error);
      const message =
        error instanceof Error ? error.message : 'Error getting all payments';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({ name: 'id', description: 'Payment document ID' })
  @ApiResponse({ status: 200, description: 'Payment found.' })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
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

  @ApiOperation({ summary: 'Get payments by tutor' })
  @ApiParam({ name: 'tutorId', description: 'Tutor Firebase UID' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiResponse({ status: 200, description: 'Payments for the tutor.' })
  @Get('tutor/:tutorId')
  async getPaymentsByTutor(
    @Param('tutorId') tutorId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? Number.parseInt(limit, 10) : 50;
      const payments = await this.paymentService.getPaymentsByTutor(tutorId, limitNum);
      return { success: true, payments, count: payments.length };
    } catch (error) {
      this.logger.error(`Error getting payments for tutor ${tutorId}:`, error);
      const message =
        error instanceof Error ? error.message : 'Error getting payments by tutor';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get payments by student' })
  @ApiParam({ name: 'studentId', description: 'Student Firebase UID' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiResponse({ status: 200, description: 'Payments for the student.' })
  @Get('student/:studentId')
  async getPaymentsByStudent(
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? Number.parseInt(limit, 10) : 50;
      const payments = await this.paymentService.getPaymentsByStudent(studentId, limitNum);
      return { success: true, payments, count: payments.length };
    } catch (error) {
      this.logger.error(`Error getting payments for student ${studentId}:`, error);
      const message =
        error instanceof Error ? error.message : 'Error getting payments by student';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Create a payment record' })
  @ApiResponse({ status: 201, description: 'Payment created.' })
  @ApiResponse({ status: 400, description: 'Validation error (courseId is required).' })
  @Post()
  async createPayment(@Body() paymentData: CreatePaymentDto) {
    try {
      const payment = await this.paymentService.createPayment(paymentData);
      return { success: true, payment };
    } catch (error) {
      this.logger.error('Error creating payment:', error);
      const message =
        error instanceof Error ? error.message : 'Error creating payment';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Update a payment record (status, Wompi transaction ID, etc.)' })
  @ApiParam({ name: 'id', description: 'Payment document ID' })
  @ApiResponse({ status: 200, description: 'Payment updated.' })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
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
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({
    summary: 'Wompi webhook receiver',
    description:
      'Endpoint called by Wompi when a transaction changes status. Validates HMAC-SHA256 signature and updates the payment record.',
  })
  @ApiBody({
    schema: {
      example: {
        event: 'transaction.updated',
        data: { transaction: { id: 'wompi_tx_123', status: 'APPROVED', reference: 'payment_doc_id' } },
        signature: { properties: { checksum: 'sha256hash' } },
        timestamp: 1700000000,
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook processed.' })
  @ApiResponse({ status: 400, description: 'Invalid Wompi signature.' })
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
      throw new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({
    summary: 'Create a Wompi payment intent',
    description:
      'Creates a pending payment record and generates the Wompi integrity signature hash needed to open the Wompi payment widget on the client.',
  })
  @ApiResponse({ status: 201, description: 'Wompi payment intent created.' })
  @Post('wompi/create')
  async createWompiPayment(@Body() paymentData: CreateWompiPaymentDto) {
    try {
      const wompiResponse = await this.paymentService.createWompiPayment(paymentData);
      return { success: true, wompiResponse };
    } catch (error) {
      this.logger.error('Error creating Wompi payment:', error);
      const message =
        error instanceof Error ? error.message : 'Error creating Wompi payment';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
