export class CreateWompiPaymentDto {
  sessionId: string;
  tutorId: string;
  studentId?: string;
  courseId: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
}
