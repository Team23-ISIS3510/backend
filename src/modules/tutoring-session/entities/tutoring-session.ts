export interface TutoringSession {
    id?: string;
    tutorId: string;
    studentId: string;
    courseId: string; // Required
    scheduledStart: Date;
    scheduledEnd: Date;
    status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'declined' | 'no_show' | 'rejected';
  
    // Optional fields
    course?: string;
    tutorApprovalStatus?: 'pending' | 'approved' | 'declined';
    paymentId?: string;
    paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
    location?: string;
    notes?: string;
    rating?: number;
    review?: string;
    reviews?: TutoringSessionReview[];
    averageRating?: number;
    price?: number;
  
    // Slot booking fields
    parentAvailabilityId?: string;
    slotIndex?: number;
    slotId?: string;
    googleEventId?: string;
  
    // Calico Calendar fields
    calicoCalendarEventId?: string;
    calicoCalendarHtmlLink?: string;
    meetLink?: string;
  
    // Approval/Rejection fields
    requestedAt?: Date;
    acceptedAt?: Date;
    rejectedAt?: Date;
    declinedAt?: Date;
    rejectionReason?: string;
  
    // Cancellation fields
    cancelledBy?: string;
    cancelledAt?: Date;
    cancellationReason?: string;
  
    // Rescheduling fields
    rescheduledAt?: Date;
    rescheduledReason?: string;
  
    // Completion fields
    completedAt?: Date;
  
    // Payment proof fields
    paymentProof?: {
      url?: string;
      fileName?: string;
      amountSent?: number;
      senderName?: string;
      transactionNumber?: string;
      submittedAt?: Date;
    };
  
    // Legacy fields (for compatibility)
    tutorEmail?: string;
    studentEmail?: string;
    studentName?: string;
    tutorName?: string;
    scheduledDateTime?: Date; // Alias for scheduledStart
    endDateTime?: Date; // Alias for scheduledEnd
  
    createdAt: Date;
    updatedAt?: Date;
  }
  
  export interface TutoringSessionReview {
    reviewerEmail: string;
    reviewerName?: string;
    stars: number;
    comment?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  