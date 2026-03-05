import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { TutoringSessionRepository } from './tutoring-session.repository';
import { SlotBookingRepository } from './slot-booking.repository';
import { CalicoCalendarService } from '../calico-calendar/calico-calendar.service';
import { NotificationService } from '../notification/notification.service';
import { UserService } from '../user/user.service';
import { TutoringSession, TutoringSessionReview } from './entities/tutoring-session.entity';
import { Slot } from '../availability/slot.service';
import { CourseHelper } from '../../common/helpers/course.helper';

@Injectable()
export class TutoringSessionService {
  private readonly logger = new Logger(TutoringSessionService.name);

  constructor(
    private readonly sessionRepository: TutoringSessionRepository,
    private readonly slotBookingRepository: SlotBookingRepository,
    private readonly calicoCalendarService: CalicoCalendarService,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) {}

  async getSessionById(id: string): Promise<TutoringSession> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    return session;
  }

  /**
   * Add or update a review for a tutoring session
   */
  async addReview(
    sessionId: string,
    review: Pick<TutoringSessionReview, 'reviewerEmail' | 'reviewerName' | 'stars' | 'comment'>,
  ) {
    if (!review?.reviewerEmail) {
      throw new BadRequestException('Reviewer email is required');
    }
    if (!review?.stars || review.stars < 1 || review.stars > 5) {
      throw new BadRequestException('Stars must be between 1 and 5');
    }

    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const normalizedReview: TutoringSessionReview = {
      reviewerEmail: review.reviewerEmail,
      reviewerName: review.reviewerName || review.reviewerEmail,
      stars: review.stars,
      comment: review.comment || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { reviews, averageRating } = await this.sessionRepository.addOrUpdateReview(
      sessionId,
      normalizedReview,
    );

    return {
      success: true,
      sessionId,
      review: normalizedReview,
      reviews,
      averageRating,
    };
  }

  /**
   * Get reviews for a tutoring session
   */
  async getReviews(sessionId: string) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return {
      success: true,
      sessionId,
      reviews: session.reviews || [],
      averageRating: session.averageRating || session.rating || 0,
    };
  }

  async createSession(sessionData: Partial<TutoringSession>): Promise<TutoringSession> {
    const cleanedData = await this.validateAndCleanSessionData(sessionData);
    const requiresApproval = (sessionData as any).requiresApproval !== false;

    const finalData: Partial<TutoringSession> = {
      ...cleanedData,
      status: requiresApproval ? 'pending' : 'scheduled',
      tutorApprovalStatus: requiresApproval ? 'pending' : 'approved',
      paymentStatus: 'pending',
    };

    if (requiresApproval) {
      finalData.requestedAt = new Date();
    }

    const id = await this.sessionRepository.save(undefined, finalData);
    this.logger.log(`Tutoring session created with ID: ${id}, Status: ${finalData.status}`);
    return await this.getSessionById(id);
  }

  async updateSession(id: string, sessionData: Partial<TutoringSession>): Promise<TutoringSession> {
    // Remove undefined values
    const cleanedData = Object.fromEntries(
      Object.entries(sessionData).filter(([_, value]) => value !== undefined && value !== null),
    );

    await this.sessionRepository.save(id, cleanedData);
    return await this.getSessionById(id);
  }

  async getSessionsByTutor(tutorId: string, limit: number = 50): Promise<TutoringSession[]> {
    return await this.sessionRepository.findByTutor(tutorId, limit);
  }

  async getSessionsByStudent(studentId: string, limit: number = 50): Promise<TutoringSession[]> {
    return await this.sessionRepository.findByStudent(studentId, limit);
  }

  /**
   * Book a specific slot for a student
   */
  async bookSpecificSlot(
    slot: Slot,
    studentEmail: string,
    studentName: string,
    notes: string = '',
    selectedCourse: string | null = null,
  ): Promise<TutoringSession> {
    try {
      this.logger.log(`Booking slot ${slot.id} for student ${studentEmail}`);

      // Verify slot is available
      if (slot.isBooked) {
        throw new BadRequestException('Este horario ya no está disponible');
      }

      // Verify slot is not already booked in database
      const existingBooking = await this.getSlotBooking(slot.parentAvailabilityId, slot.slotIndex);
      if (existingBooking) {
        throw new BadRequestException('Este horario ya fue reservado por otro estudiante');
      }

      // Extract course
      let extractedCourse = 'Tutoría General';
      if (selectedCourse && selectedCourse !== '') {
        extractedCourse = selectedCourse;
      } else if (slot.course && slot.course !== '') {
        extractedCourse = slot.course;
      } else if (slot.title) {
        extractedCourse = CourseHelper.extractCourseFromTitle(slot.title) ?? 'Tutoría General';
      }

      // tutorId in slot is the document ID (not email)
      // We need to get the tutor's email for calendar events and notifications
      const tutorDocumentId = slot.tutorId;
      if (!tutorDocumentId) {
        throw new BadRequestException('Tutor ID is required');
      }

      // Get tutor email from UserService
      let tutorEmail = slot.tutorEmail;
      if (!tutorEmail) {
        try {
          const tutorUser = await this.userService.getUserById(tutorDocumentId);
          tutorEmail = tutorUser.email;
        } catch (error) {
          this.logger.warn(`Could not get tutor email for ${tutorDocumentId}:`, error);
        }
      }

      // Get student document ID from email
      let studentDocumentId = studentEmail;
      if (studentEmail.includes('@')) {
        try {
          const studentUser = await this.userService.getUserByEmail(studentEmail);
          if (studentUser) {
            studentDocumentId = studentUser.uid; // Use document ID, not email
          }
        } catch (error) {
          this.logger.warn(`Could not get student ID for ${studentEmail}:`, error);
        }
      }

      const sessionData: Partial<TutoringSession> = {
        tutorId: tutorDocumentId, // Document ID (not email)
        studentId: studentDocumentId, // Document ID (not email)
        tutorEmail: tutorEmail || '', // Email for reference
        studentEmail: studentEmail, // Email for reference
        studentName: studentName,
        scheduledStart: new Date(slot.startDateTime),
        scheduledEnd: new Date(slot.endDateTime),
        scheduledDateTime: new Date(slot.startDateTime),
        endDateTime: new Date(slot.endDateTime),
        course: extractedCourse,
        location: slot.location || 'Por definir',
        price: 50000, // Price per hour
        parentAvailabilityId: slot.parentAvailabilityId,
        slotIndex: slot.slotIndex,
        slotId: slot.id,
        googleEventId: slot.googleEventId,
        notes: notes || '',
        status: 'scheduled',
        paymentStatus: 'pending',
      };

      const session = await this.createSession(sessionData);

      // Create Calico Calendar event
      try {
        const calendarEventResult = await this.calicoCalendarService.createTutoringSessionEvent({
          summary: `Tutoría ${extractedCourse || 'General'}`,
          description: `Sesión de tutoría agendada a través de Calico.\n\nMateria: ${extractedCourse}\nTutor: ${tutorEmail || tutorDocumentId}\nEstudiante: ${studentName || studentEmail}\n\nNotas: ${notes || 'Sin notas adicionales'}\n\nID de sesión: ${session.id}`,
          startDateTime: new Date(slot.startDateTime),
          endDateTime: new Date(slot.endDateTime),
          attendees: [studentEmail],
          location: slot.location || 'Por definir',
          tutorEmail: tutorEmail || '',
          tutorId: tutorDocumentId, // Document ID (required field)
          tutorName: tutorEmail || tutorDocumentId,
        });

        if (calendarEventResult.success && calendarEventResult.eventId) {
          await this.updateSession(session.id!, {
            calicoCalendarEventId: calendarEventResult.eventId,
            calicoCalendarHtmlLink: calendarEventResult.htmlLink || undefined,
            meetLink: calendarEventResult.meetLink || undefined,
          });
          this.logger.log(`Calico Calendar event created: ${calendarEventResult.eventId}`);
        } else if (calendarEventResult.warning) {
          this.logger.warn(`Calendar warning: ${calendarEventResult.warning}`);
        }
      } catch (calendarError: any) {
        this.logger.warn(`Error creating calendar event (session still created): ${calendarError.message}`);
      }

      // Create slot booking
      await this.createSlotBooking({
        parentAvailabilityId: slot.parentAvailabilityId,
        slotIndex: slot.slotIndex,
        slotId: slot.id,
        tutorEmail: tutorEmail || '', // Use email for reference
        studentEmail: studentEmail, // Use email for reference
        sessionId: session.id!,
        slotStartTime: new Date(slot.startDateTime),
        slotEndTime: new Date(slot.endDateTime),
        course: extractedCourse,
      });

      // Create notification for tutor (use document ID, not email)
      try {
        await this.notificationService.createNotification({
          recipientId: tutorDocumentId, // Use document ID, not email
          type: 'session_pending',
          title: 'Nueva sesión de tutoría solicitada',
          message: `${studentName || studentEmail} ha solicitado una sesión de ${extractedCourse}`,
          relatedEntityId: session.id,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Slot ${slot.id} booked successfully for ${studentEmail}`);
      return session;
    } catch (error: any) {
      this.logger.error('Error booking specific slot:', error);
      throw error;
    }
  }

  /**
   * Create a slot booking
   */
  async createSlotBooking(bookingData: {
    parentAvailabilityId: string;
    slotIndex: number;
    slotId?: string;
    tutorEmail?: string;
    studentEmail?: string;
    sessionId: string;
    slotStartTime: Date;
    slotEndTime: Date;
    course?: string;
  }): Promise<string> {
    try {
      const id = await this.slotBookingRepository.save(undefined, {
        ...bookingData,
        bookedAt: new Date(),
      });
      this.logger.log(`Slot booking created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Error creating slot booking:', error);
      throw error;
    }
  }

  /**
   * Get slot booking by parent availability and slot index
   */
  async getSlotBooking(
    parentAvailabilityId: string,
    slotIndex: number,
  ): Promise<any | null> {
    try {
      return await this.slotBookingRepository.findByParentAndIndex(parentAvailabilityId, slotIndex);
    } catch (error) {
      this.logger.error('Error getting slot booking:', error);
      return null;
    }
  }

  /**
   * Get all slot bookings for an availability
   */
  async getSlotBookingsForAvailability(parentAvailabilityId: string): Promise<any[]> {
    try {
      return await this.slotBookingRepository.findByAvailability(parentAvailabilityId);
    } catch (error) {
      this.logger.error('Error getting slot bookings for availability:', error);
      return [];
    }
  }

  /**
   * Get slot bookings for a tutor
   */
  async getSlotBookingsForTutor(tutorEmail: string): Promise<any[]> {
    try {
      return await this.slotBookingRepository.findByTutor(tutorEmail);
    } catch (error) {
      this.logger.error('Error getting slot bookings for tutor:', error);
      return [];
    }
  }

  /**
   * Cancel a slot booking
   */
  async cancelSlotBooking(sessionId: string, cancelledBy: string): Promise<void> {
    try {
      const session = await this.getSessionById(sessionId);

      // Update session status
      await this.updateSession(sessionId, {
        status: 'cancelled',
        cancelledBy: cancelledBy,
        cancelledAt: new Date(),
      });

      // Delete slot booking
      if (session.parentAvailabilityId && session.slotIndex !== undefined) {
        await this.slotBookingRepository.deleteByParentAndIndex(
          session.parentAvailabilityId,
          session.slotIndex,
          sessionId,
        );
      }

      this.logger.log(`Session and slot booking cancelled: ${sessionId}`);
    } catch (error) {
      this.logger.error('Error cancelling slot booking:', error);
      throw error;
    }
  }

  /**
   * Accept a pending tutoring session
   */
  async acceptTutoringSession(sessionId: string, tutorId: string): Promise<TutoringSession> {
    try {
      const session = await this.getSessionById(sessionId);

      if (session.tutorId !== tutorId) {
        throw new BadRequestException('Unauthorized to accept this session');
      }

      if (session.status !== 'pending') {
        throw new BadRequestException('Session is no longer pending');
      }

      const updated = await this.updateSession(sessionId, {
        status: 'scheduled',
        tutorApprovalStatus: 'approved',
        acceptedAt: new Date(),
      });

      // Create notification for student
      try {
        await this.notificationService.createNotification({
          recipientId: session.studentId,
          type: 'session_accepted',
          title: 'Sesión de tutoría aceptada',
          message: `Tu sesión de ${session.course || 'tutoría'} ha sido aceptada por el tutor`,
          relatedEntityId: sessionId,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Session accepted: ${sessionId}`);
      return updated;
    } catch (error: any) {
      this.logger.error('Error accepting session:', error);
      throw error;
    }
  }

  /**
   * Reject a pending tutoring session
   */
  async rejectTutoringSession(
    sessionId: string,
    tutorId: string,
    reason: string = '',
  ): Promise<TutoringSession> {
    try {
      const session = await this.getSessionById(sessionId);

      if (session.tutorId !== tutorId) {
        throw new BadRequestException('Unauthorized to reject this session');
      }

      if (session.status !== 'pending') {
        throw new BadRequestException('Session is no longer pending');
      }

      const updated = await this.updateSession(sessionId, {
        status: 'rejected',
        tutorApprovalStatus: 'declined',
        rejectedAt: new Date(),
        rejectionReason: reason,
      });

      // Create notification for student
      try {
        await this.notificationService.createNotification({
          recipientId: session.studentId,
          type: 'session_rejected',
          title: 'Sesión de tutoría rechazada',
          message: reason || 'Tu sesión de tutoría ha sido rechazada por el tutor',
          relatedEntityId: sessionId,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Session rejected: ${sessionId}`);
      return updated;
    } catch (error: any) {
      this.logger.error('Error rejecting session:', error);
      throw error;
    }
  }

  /**
   * Decline a pending tutoring session
   */
  async declineTutoringSession(sessionId: string, tutorId: string): Promise<TutoringSession> {
    try {
      const session = await this.getSessionById(sessionId);

      if (session.tutorId !== tutorId) {
        throw new BadRequestException('Unauthorized to decline this session');
      }

      if (session.status !== 'pending') {
        throw new BadRequestException('Session is no longer pending');
      }

      const updated = await this.updateSession(sessionId, {
        status: 'declined',
        tutorApprovalStatus: 'declined',
        declinedAt: new Date(),
      });

      // Remove slot booking
      if (session.parentAvailabilityId && session.slotIndex !== undefined) {
        await this.slotBookingRepository.deleteByParentAndIndex(
          session.parentAvailabilityId,
          session.slotIndex,
          sessionId,
        );
      }

      // Create notification for student
      try {
        await this.notificationService.createNotification({
          recipientId: session.studentId,
          type: 'session_declined',
          title: 'Sesión de tutoría declinada',
          message: 'Tu sesión de tutoría ha sido declinada por el tutor',
          relatedEntityId: sessionId,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Session declined: ${sessionId}`);
      return updated;
    } catch (error: any) {
      this.logger.error('Error declining session:', error);
      throw error;
    }
  }

  /**
   * Get pending sessions for a tutor
   */
  async getPendingSessionsForTutor(tutorId: string, limit: number = 50): Promise<TutoringSession[]> {
    try {
      return await this.sessionRepository.findByTutorAndApprovalStatus(tutorId, 'pending', limit);
    } catch (error) {
      this.logger.error('Error getting pending sessions:', error);
      throw error;
    }
  }

  /**
   * Complete a tutoring session
   */
  async completeSession(
    sessionId: string,
    rating?: number,
    comment?: string,
  ): Promise<TutoringSession> {
    try {
      const updateData: Partial<TutoringSession> = {
        status: 'completed',
        completedAt: new Date(),
      };

      if (rating) {
        updateData.rating = rating;
        updateData.review = comment;
      }

      return await this.updateSession(sessionId, updateData);
    } catch (error) {
      this.logger.error('Error completing session:', error);
      throw error;
    }
  }

  /**
   * Get tutor session statistics
   */
  async getTutorSessionStats(tutorId: string): Promise<{
    total: number;
    completed: number;
    scheduled: number;
    cancelled: number;
    totalEarnings: number;
    averageRating: number;
  }> {
    try {
      const sessions = await this.getSessionsByTutor(tutorId, 1000);

      const stats = {
        total: sessions.length,
        completed: sessions.filter((s) => s.status === 'completed').length,
        scheduled: sessions.filter((s) => s.status === 'scheduled').length,
        cancelled: sessions.filter((s) => s.status === 'cancelled').length,
        totalEarnings: sessions
          .filter((s) => s.status === 'completed' && s.paymentStatus === 'paid')
          .reduce((sum, s) => sum + (s.price || 0), 0),
        averageRating: this.calculateAverageRating(sessions),
      };

      return stats;
    } catch (error) {
      this.logger.error('Error getting tutor session stats:', error);
      return {
        total: 0,
        completed: 0,
        scheduled: 0,
        cancelled: 0,
        totalEarnings: 0,
        averageRating: 0,
      };
    }
  }

  /**
   * Get tutor weekly performance
   */
  async getTutorWeeklyPerformance(tutorId: string): Promise<{
    weeklySessions: number;
    weeklyEarnings: number;
    studentRetention: number;
    completedSessions: number;
    scheduledSessions: number;
    cancelledSessions: number;
  }> {
    try {
      const sessions = await this.getSessionsByTutor(tutorId, 1000);
      const now = new Date();

      // Calculate start of week (Monday)
      const startOfWeek = new Date(now);
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(now.getDate() - daysToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      // Calculate end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Filter sessions from this week
      const weeklySessions = sessions.filter((session) => {
        const sessionDate = new Date(session.scheduledStart);
        return sessionDate >= startOfWeek && sessionDate <= endOfWeek;
      });

      const weeklyStats = {
        weeklySessions: weeklySessions.length,
        weeklyEarnings: weeklySessions
          .filter((s) => s.status === 'completed' && s.paymentStatus === 'paid')
          .reduce((sum, s) => sum + (s.price || 0), 0),
        studentRetention: this.calculateStudentRetention(weeklySessions),
        completedSessions: weeklySessions.filter((s) => s.status === 'completed').length,
        scheduledSessions: weeklySessions.filter((s) => s.status === 'scheduled').length,
        cancelledSessions: weeklySessions.filter((s) => s.status === 'cancelled').length,
      };

      return weeklyStats;
    } catch (error) {
      this.logger.error('Error getting tutor weekly performance:', error);
      return {
        weeklySessions: 0,
        weeklyEarnings: 0,
        studentRetention: 0,
        completedSessions: 0,
        scheduledSessions: 0,
        cancelledSessions: 0,
      };
    }
  }

  /**
   * Cancel a tutoring session
   */
  async cancelSession(
    sessionId: string,
    cancelledBy: string,
    reason: string = 'Sesión cancelada',
  ): Promise<TutoringSession> {
    try {
      const session = await this.getSessionById(sessionId);

      if (session.status === 'cancelled') {
        throw new BadRequestException('Esta sesión ya fue cancelada');
      }

      // Verify can cancel (more than 2 hours before)
      if (!this.canCancelSession(session.scheduledStart)) {
        throw new BadRequestException(
          'No puedes cancelar esta sesión. Debe ser con al menos 2 horas de anticipación.',
        );
      }

      // Cancel Calico Calendar event if exists
      if (session.calicoCalendarEventId) {
        try {
          await this.calicoCalendarService.cancelTutoringSessionEvent(
            session.calicoCalendarEventId,
            reason,
          );
        } catch (calendarError) {
          this.logger.warn(`Error cancelling calendar event: ${calendarError}`);
        }
      }

      // Update session
      const updated = await this.updateSession(sessionId, {
        status: 'cancelled',
        cancelledBy: cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: reason,
      });

      // Delete slot booking
      if (session.parentAvailabilityId && session.slotIndex !== undefined) {
        await this.slotBookingRepository.deleteByParentAndIndex(
          session.parentAvailabilityId,
          session.slotIndex,
          sessionId,
        );
      }

      // Create notification
      const otherPartyId = cancelledBy === session.tutorId ? session.studentId : session.tutorId;
      try {
        await this.notificationService.createNotification({
          recipientId: otherPartyId,
          type: 'session_cancelled',
          title: 'Sesión cancelada',
          message: reason || 'Una sesión de tutoría ha sido cancelada',
          relatedEntityId: sessionId,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Session cancelled successfully by ${cancelledBy}`);
      return updated;
    } catch (error: any) {
      this.logger.error('Error cancelling session:', error);
      throw error;
    }
  }

  /**
   * Reschedule a tutoring session
   */
  async rescheduleSession(
    sessionId: string,
    newSlot: Slot,
    reason: string = 'Sesión reprogramada',
  ): Promise<TutoringSession> {
    try {
      const session = await this.getSessionById(sessionId);

      if (session.status === 'cancelled') {
        throw new BadRequestException('No puedes reprogramar una sesión cancelada');
      }

      if (session.status === 'completed') {
        throw new BadRequestException('No puedes reprogramar una sesión completada');
      }

      // Verify new slot is available
      if (newSlot.isBooked) {
        throw new BadRequestException('Este horario ya no está disponible');
      }

      const existingBooking = await this.getSlotBooking(
        newSlot.parentAvailabilityId,
        newSlot.slotIndex,
      );
      if (existingBooking) {
        throw new BadRequestException('Este horario ya fue reservado por otro estudiante');
      }

      // Verify same tutor (tutorId is document ID, not email)
      const newSlotTutorId = newSlot.tutorId;
      if (!newSlotTutorId || newSlotTutorId !== session.tutorId) {
        throw new BadRequestException('Solo puedes reprogramar con el mismo tutor');
      }

      // Free old slot
      if (session.parentAvailabilityId && session.slotIndex !== undefined) {
        await this.slotBookingRepository.deleteByParentAndIndex(
          session.parentAvailabilityId,
          session.slotIndex,
          sessionId,
        );
      }

      // Cancel old calendar event
      if (session.calicoCalendarEventId) {
        try {
          await this.calicoCalendarService.cancelTutoringSessionEvent(
            session.calicoCalendarEventId,
            reason,
          );
        } catch (calendarError) {
          this.logger.warn(`Error cancelling old calendar event: ${calendarError}`);
        }
      }

      // Create new calendar event
      let newCalendarEventId = session.calicoCalendarEventId;
      let newCalendarHtmlLink = session.calicoCalendarHtmlLink;
      let newMeetLink = session.meetLink;

      // Get tutor email if needed (tutorId is document ID, not email)
      let tutorEmail = session.tutorEmail;
      if (!tutorEmail && session.tutorId) {
        try {
          const tutorUser = await this.userService.getUserById(session.tutorId);
          tutorEmail = tutorUser.email;
        } catch (error) {
          this.logger.warn(`Could not get tutor email for ${session.tutorId}:`, error);
        }
      }

      // Get student email if needed (studentId is document ID, not email)
      let studentEmail = session.studentEmail;
      if (!studentEmail && session.studentId) {
        try {
          const studentUser = await this.userService.getUserById(session.studentId);
          studentEmail = studentUser.email;
        } catch (error) {
          this.logger.warn(`Could not get student email for ${session.studentId}:`, error);
        }
      }

      try {
        const calendarEventResult = await this.calicoCalendarService.createTutoringSessionEvent({
          summary: `Tutoría ${session.course || 'General'}`,
          description: `${session.notes || ''}\n\n[REPROGRAMADA] ${reason}`,
          startDateTime: new Date(newSlot.startDateTime),
          endDateTime: new Date(newSlot.endDateTime),
          attendees: [studentEmail || ''], // Use email for calendar attendees
          location: newSlot.location || session.location || 'Por definir',
          tutorEmail: tutorEmail || '', // Use email, not document ID
          tutorId: session.tutorId, // Document ID (required field)
          tutorName: session.tutorName || tutorEmail || session.tutorId,
        });

        if (calendarEventResult.success && calendarEventResult.eventId) {
          newCalendarEventId = calendarEventResult.eventId;
          newCalendarHtmlLink = calendarEventResult.htmlLink || undefined;
          newMeetLink = calendarEventResult.meetLink || undefined;
        }
      } catch (calendarError) {
        this.logger.warn(`Warning: Could not create calendar event for rescheduled session: ${calendarError}`);
      }

      // Update session
      const updated = await this.updateSession(sessionId, {
        scheduledStart: new Date(newSlot.startDateTime),
        scheduledEnd: new Date(newSlot.endDateTime),
        scheduledDateTime: new Date(newSlot.startDateTime),
        endDateTime: new Date(newSlot.endDateTime),
        location: newSlot.location || session.location,
        parentAvailabilityId: newSlot.parentAvailabilityId,
        slotIndex: newSlot.slotIndex,
        slotId: newSlot.id,
        googleEventId: newSlot.googleEventId || session.googleEventId,
        calicoCalendarEventId: newCalendarEventId,
        calicoCalendarHtmlLink: newCalendarHtmlLink,
        meetLink: newMeetLink,
        rescheduledAt: new Date(),
        rescheduledReason: reason,
      });

      // Create new slot booking
      await this.createSlotBooking({
        parentAvailabilityId: newSlot.parentAvailabilityId,
        slotIndex: newSlot.slotIndex,
        slotId: newSlot.id,
        tutorEmail: newSlot.tutorEmail,
        studentEmail: studentEmail || '', // Use email for reference
        sessionId: session.id!,
        slotStartTime: new Date(newSlot.startDateTime),
        slotEndTime: new Date(newSlot.endDateTime),
        course: session.course,
      });

      // Create notification
      try {
        await this.notificationService.createNotification({
          recipientId: session.tutorId,
          type: 'session_rescheduled',
          title: 'Sesión reprogramada',
          message: `La sesión ha sido reprogramada para ${new Date(newSlot.startDateTime).toLocaleString()}`,
          relatedEntityId: sessionId,
          relatedEntityType: 'session',
        });
      } catch (notifError) {
        this.logger.warn(`Error creating notification: ${notifError}`);
      }

      this.logger.log(`Session rescheduled successfully: ${sessionId}`);
      return updated;
    } catch (error: any) {
      this.logger.error('Error rescheduling session:', error);
      throw error;
    }
  }

  /**
   * Submit payment proof
   */
  async submitPaymentProof(
    sessionId: string,
    proofData: {
      fileUrl?: string;
      fileName?: string;
      amountSent?: number;
      senderName?: string;
      transactionNumber?: string;
    },
  ): Promise<TutoringSession> {
    try {
      if (!sessionId) {
        throw new BadRequestException('sessionId is required');
      }

      const updateData: Partial<TutoringSession> = {
        paymentStatus: 'pending',
        paymentProof: {
          url: proofData.fileUrl || undefined,
          fileName: proofData.fileName || undefined,
          amountSent: proofData.amountSent || undefined,
          senderName: proofData.senderName || undefined,
          transactionNumber: proofData.transactionNumber || undefined,
          submittedAt: new Date(),
        },
      };

      return await this.updateSession(sessionId, updateData);
    } catch (error: any) {
      this.logger.error('Error submitting payment proof:', error);
      throw error;
    }
  }

  /**
   * Check if session can be cancelled (more than 2 hours before)
   */
  canCancelSession(scheduledStart: Date): boolean {
    const now = new Date();
    const sessionDate = new Date(scheduledStart);
    const hoursUntilSession = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilSession > 2;
  }

  /**
   * Calculate average rating
   */
  private calculateAverageRating(sessions: TutoringSession[]): number {
    const ratedSessions = sessions.filter((s) => s.rating && s.rating > 0);
    if (ratedSessions.length === 0) return 0;
    const totalRating = ratedSessions.reduce((sum, s) => sum + (s.rating || 0), 0);
    return totalRating / ratedSessions.length;
  }

  /**
   * Calculate student retention
   * Uses studentId (document ID) to identify unique students - id and email are different
   */
  private calculateStudentRetention(sessions: TutoringSession[]): number {
    if (sessions.length === 0) return 0;

    // Use studentId (document ID) to identify unique students - filter out empty values
    const uniqueStudents = new Set(sessions.map((s) => s.studentId).filter(Boolean));
    const totalStudents = uniqueStudents.size;

    if (totalStudents === 0) return 0;

    let returningStudents = 0;
    uniqueStudents.forEach((studentId) => {
      const studentSessions = sessions.filter((s) => s.studentId === studentId);
      if (studentSessions.length > 1) {
        returningStudents++;
      }
    });

    return totalStudents > 0 ? Math.round((returningStudents / totalStudents) * 100) : 0;
  }


  /**
   * Validate and clean session data
   * Converts emails to document IDs when needed (id and email are different)
   */
  private async validateAndCleanSessionData(sessionData: Partial<TutoringSession>): Promise<Partial<TutoringSession>> {
    const cleaned: any = {};

    const fieldDefaults: any = {
      tutorId: null,
      studentId: null,
      courseId: null,
      course: 'Tutoría General',
      location: 'Por definir',
      price: 50000,
      notes: '',
    };

    // Copy valid fields
    Object.keys(fieldDefaults).forEach((key) => {
      let value = (sessionData as any)[key];
      if (value === undefined || value === null) {
        value = fieldDefaults[key];
      }
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    });

    // Copy additional fields
    Object.keys(sessionData).forEach((key) => {
      if (!fieldDefaults.hasOwnProperty(key) && (sessionData as any)[key] !== undefined && (sessionData as any)[key] !== null) {
        cleaned[key] = (sessionData as any)[key];
      }
    });

    // Validations
    if (!cleaned.tutorId && !cleaned.tutorEmail) {
      throw new BadRequestException('tutorId or tutorEmail is required');
    }

    if (!cleaned.studentId && !cleaned.studentEmail) {
      throw new BadRequestException('studentId or studentEmail is required');
    }

    if (!cleaned.courseId) {
      throw new BadRequestException('courseId is required');
    }

    if (!cleaned.scheduledStart && !cleaned.scheduledDateTime) {
      throw new BadRequestException('scheduledStart or scheduledDateTime is required');
    }

    if (!cleaned.scheduledEnd && !cleaned.endDateTime) {
      throw new BadRequestException('scheduledEnd or endDateTime is required');
    }

    // Ensure course is never empty
    if (!cleaned.course || cleaned.course === '') {
      cleaned.course = 'Tutoría General';
    }

    // Normalize dates
    if (cleaned.scheduledDateTime && !cleaned.scheduledStart) {
      cleaned.scheduledStart = cleaned.scheduledDateTime;
    }
    if (cleaned.endDateTime && !cleaned.scheduledEnd) {
      cleaned.scheduledEnd = cleaned.endDateTime;
    }

    // Normalize IDs - id and email are different
    // If tutorEmail is provided but tutorId is not, convert email to document ID
    if (cleaned.tutorEmail && !cleaned.tutorId && cleaned.tutorEmail.includes('@')) {
      try {
        const tutorUser = await this.userService.getUserByEmail(cleaned.tutorEmail);
        if (tutorUser) {
          cleaned.tutorId = tutorUser.uid; // Use document ID, not email
        }
      } catch (error) {
        this.logger.warn(`Could not convert tutor email ${cleaned.tutorEmail} to ID:`, error);
      }
    }
    // If tutorId is provided but tutorEmail is not, get email from UserService
    if (cleaned.tutorId && !cleaned.tutorEmail && !cleaned.tutorId.includes('@')) {
      try {
        const tutorUser = await this.userService.getUserById(cleaned.tutorId);
        if (tutorUser) {
          cleaned.tutorEmail = tutorUser.email;
        }
      } catch (error) {
        this.logger.warn(`Could not get tutor email for ${cleaned.tutorId}:`, error);
      }
    }
    // Same for student
    if (cleaned.studentEmail && !cleaned.studentId && cleaned.studentEmail.includes('@')) {
      try {
        const studentUser = await this.userService.getUserByEmail(cleaned.studentEmail);
        if (studentUser) {
          cleaned.studentId = studentUser.uid; // Use document ID, not email
        }
      } catch (error) {
        this.logger.warn(`Could not convert student email ${cleaned.studentEmail} to ID:`, error);
      }
    }
    if (cleaned.studentId && !cleaned.studentEmail && !cleaned.studentId.includes('@')) {
      try {
        const studentUser = await this.userService.getUserById(cleaned.studentId);
        if (studentUser) {
          cleaned.studentEmail = studentUser.email;
        }
      } catch (error) {
        this.logger.warn(`Could not get student email for ${cleaned.studentId}:`, error);
      }
    }

    this.logger.debug('Cleaned session data:', {
      originalFields: Object.keys(sessionData),
      cleanedFields: Object.keys(cleaned),
      course: cleaned.course,
    });

    return cleaned;
  }

  /**
   * Get student tutoring history with tutor information
   */
  async getStudentTutoringHistory(studentId: string, limit: number = 100): Promise<any[]> {
    try {
      this.logger.log(`Getting tutoring history for student: ${studentId}`);

      const sessions = await this.getSessionsByStudent(studentId, limit);

      // Enrich sessions with tutor information
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          try {
            // tutorId is document ID (not email)
            const tutorDocumentId = session.tutorId;
            if (!tutorDocumentId) {
              return {
                ...session,
                tutorName: session.tutorEmail || '',
                tutorProfilePicture: null,
              };
            }

            const tutorInfo = await this.getTutorInfo(tutorDocumentId);
            return {
              ...session,
              tutorName: tutorInfo?.name || tutorInfo?.displayName || session.tutorEmail || session.tutorId || '',
              tutorProfilePicture: tutorInfo?.profilePicture || null,
            };
          } catch (error) {
            this.logger.warn(`Error getting tutor info for ${session.tutorId}:`, error);
            return {
              ...session,
              tutorName: session.tutorEmail || session.tutorId || '',
              tutorProfilePicture: null,
            };
          }
        }),
      );

      this.logger.log(`Found ${enrichedSessions.length} sessions for student ${studentId}`);
      return enrichedSessions;
    } catch (error) {
      this.logger.error('Error getting student tutoring history:', error);
      throw error;
    }
  }

  /**
   * Get tutor information from users collection
   * tutorIdOrEmail can be document ID or email - id and email are different
   */
  async getTutorInfo(tutorIdOrEmail: string): Promise<any | null> {
    try {
      if (!tutorIdOrEmail) return null;

      let user = null;

      // Try by document ID first (preferred - id is different from email)
      if (!tutorIdOrEmail.includes('@')) {
        try {
          user = await this.userService.getUserById(tutorIdOrEmail);
        } catch (error) {
          // If not found by ID, try by email
          if (tutorIdOrEmail.includes('@')) {
            user = await this.userService.getUserByEmail(tutorIdOrEmail);
          }
        }
      } else {
        // If it looks like an email, try by email
        user = await this.userService.getUserByEmail(tutorIdOrEmail);
      }

      if (user) {
        return {
          name: user.name,
          displayName: user.name || user.email,
          email: user.email,
          profilePicture: (user as any).profilePicture || null,
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(`Error getting tutor info for ${tutorIdOrEmail}:`, error);
      return null;
    }
  }

  /**
   * Filter sessions by date range
   */
  filterByDate(sessions: TutoringSession[], startDate?: Date, endDate?: Date): TutoringSession[] {
    if (!startDate && !endDate) return sessions;

    return sessions.filter((session) => {
      const sessionDate = new Date(session.scheduledStart || session.scheduledDateTime || 0);

      if (startDate && sessionDate < startDate) return false;
      if (endDate && sessionDate > endDate) return false;

      return true;
    });
  }

  /**
   * Filter sessions by course
   */
  filterByCourse(sessions: TutoringSession[], course?: string): TutoringSession[] {
    if (!course || course === 'Todas' || course === 'All') return sessions;

    return sessions.filter(
      (session) => session.course?.toLowerCase() === course.toLowerCase(),
    );
  }

  /**
   * Get unique courses from sessions
   */
  getUniqueCourses(sessions: TutoringSession[]): string[] {
    const courses = sessions.map((session) => session.course).filter(Boolean) as string[];
    return [...new Set(courses)].sort();
  }

  /**
   * Format date for display
   */
  formatDate(date: Date | string | undefined): string {
    if (!date) return 'Fecha no disponible';

    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else {
      dateObj = new Date(date);
    }

    if (isNaN(dateObj.getTime())) {
      return 'Fecha no disponible';
    }

    return dateObj.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Format price for display
   */
  formatPrice(price?: number): string {
    if (price === undefined || price === null) return 'Precio no disponible';

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(price);
  }

  /**
   * Get payment status color scheme
   */
  getPaymentStatusColor(status?: string): { bg: string; text: string; border: string } {
    const statusColors: Record<string, { bg: string; text: string; border: string }> = {
      paid: { bg: '#DEF7EC', text: '#03543F', border: '#84E1BC' },
      pending: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
      failed: { bg: '#FEE2E2', text: '#9B1C1C', border: '#F87171' },
      cancelled: { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' },
      'en_verificación': { bg: '#DBEAFE', text: '#1E40AF', border: '#60A5FA' },
    };

    return statusColors[status || 'pending'] || statusColors.pending;
  }

  /**
   * Translate payment status to Spanish
   */
  translatePaymentStatus(status?: string): string {
    const translations: Record<string, string> = {
      paid: 'Pagado',
      pending: 'Pendiente',
      failed: 'Fallido',
      cancelled: 'Cancelado',
      'en_verificación': 'En Verificación',
    };

    return translations[status || 'pending'] || 'Desconocido';
  }

  /**
   * Get history statistics
   */
  getHistoryStats(sessions: TutoringSession[]): {
    totalSessions: number;
    totalSpent: number;
    uniqueCourses: number;
    paidSessions: number;
    pendingSessions: number;
    courses: string[];
  } {
    const totalSessions = sessions.length;
    const totalSpent = sessions.reduce((sum, session) => sum + (session.price || 0), 0);
    const courses = this.getUniqueCourses(sessions);
    const paidSessions = sessions.filter((session) => session.paymentStatus === 'paid').length;

    return {
      totalSessions,
      totalSpent,
      uniqueCourses: courses.length,
      paidSessions,
      pendingSessions: totalSessions - paidSessions,
      courses,
    };
  }
}
