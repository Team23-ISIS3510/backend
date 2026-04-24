export interface TutoringSession {
  id?: string;
  course: string;
  courseId: string;
  createdAt: any;
  location: string;
  notes: string;
  paymentStatus: string;
  price: number;
  requestedAt: any;
  scheduledEnd: any;
  scheduledStart: any;
  status: string;
  studentEmail: string;
  studentId: string;
  tutorApprovalStatus: string;
  tutorEmail: string;
  tutorId: string;
  updatedAt: any;
  description?: string;
}
