export class CreatePaymentDto {
  tutorId: string;
  studentId: string;
  courseId: string;
  amount: number;
  currency: string;
  sessionId?: string;
  notes?: string;
}
