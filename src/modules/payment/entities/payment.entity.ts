export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Payment {
  id?: string;
  sessionId?: string;
  tutorId: string;
  studentId: string;
  courseId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod?: string;
  wompiTransactionId?: string;
  proofUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}
