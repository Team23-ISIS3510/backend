import { Injectable, Logger } from '@nestjs/common';
import { AvailabilityResponseDto } from '../availability/dto/availability-response.dto';
import { TutoringSessionService } from '../tutoring-session/tutoring-session.service';
import { TutoringSession } from '../tutoring-session/entities/tutoring-session.entity';
import { CourseHelper } from 'src/common/helpers/course.helper'; // TODO: look if it works when they impelment it 

export interface Slot {
  id: string;
  parentAvailabilityId: string;
  slotIndex: number;
  tutorId?: string;
  tutorEmail?: string;
  title: string;
  description?: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
  location?: string;
  course?: string;
  color?: string;
  googleEventId?: string;
  htmlLink?: string;
  status?: string;
  isBooked: boolean;
  bookedBy?: string | null;
  sessionId?: string | null;
  bookingId?: string;
  bookedAt?: Date | string;
  originalStartDateTime: Date | string;
  originalEndDateTime: Date | string;
  slotDuration: number; // in hours
  recurring?: boolean;
  recurrenceRule?: string;
}

@Injectable()
export class SlotService {
  private readonly logger = new Logger(SlotService.name);

  constructor(private readonly tutoringSessionService: TutoringSessionService) {}

  /**
   * Generate hourly slots from an availability
   */
  generateHourlySlots(availability: AvailabilityResponseDto): Slot[] {
    const slots: Slot[] = [];

    const startTime = new Date(availability.startDateTime);
    const endTime = new Date(availability.endDateTime);

    // If endTime is less than or equal to startTime, nothing to generate
    if (!(endTime > startTime)) {
      return slots;
    }

    // Calculate total duration in hours (include partial as a full hour)
    const totalHoursFloat = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const totalHours = Math.ceil(totalHoursFloat);

    // Generate 1-hour slots inclusively
    for (let i = 0; i < totalHours; i++) {
      let slotStart = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      let slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      // Trim last slot to endTime if partial
      if (slotEnd > endTime) {
        slotEnd = new Date(endTime);
      }

      // Create unique ID for this specific slot
      const slotId = `${availability.id}_slot_${i}`;

      const slot: Slot = {
        id: slotId,
        parentAvailabilityId: availability.id,
        slotIndex: i,
        tutorId: availability.tutorId, // Document ID (not email)
        // tutorEmail will be populated separately if needed - don't use tutorId as email
        title: availability.title,
        description: availability.description,
        startDateTime: slotStart,
        endDateTime: slotEnd,
        location: availability.location,
        course: availability.course || CourseHelper.extractCourseFromTitle(availability.title) || 'Tutoría General',
        color: availability.color,
        googleEventId: availability.googleEventId,
        htmlLink: availability.googleEventId ? `https://calendar.google.com/calendar/event?eid=${availability.googleEventId}` : undefined,
        status: 'available',
        isBooked: false,
        bookedBy: null,
        sessionId: null,
        originalStartDateTime: availability.startDateTime,
        originalEndDateTime: availability.endDateTime,
        slotDuration: Math.max(0, (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60)),
        recurring: availability.recurring,
        recurrenceRule: undefined, // Not available in DTO
      };

      // Avoid empty or negative slots (in case of trims)
      if (slotEnd > slotStart) {
        slots.push(slot);
      }
    }

    return slots;
  }

  /**
   * Generate hourly slots from multiple availabilities
   */
  generateHourlySlotsFromAvailabilities(availabilities: AvailabilityResponseDto[]): Slot[] {
    if (!Array.isArray(availabilities)) {
      this.logger.warn('generateHourlySlotsFromAvailabilities: availabilities is not a valid array');
      return [];
    }

    const allSlots: Slot[] = [];

    availabilities.forEach((availability) => {
      const slots = this.generateHourlySlots(availability);
      allSlots.push(...slots);
    });

    return allSlots;
  }

  /**
   * Apply saved bookings to generated slots
   */
  async applySavedBookingsToSlots(slots: Slot[]): Promise<Slot[]> {
    if (!slots || slots.length === 0) {
      return slots;
    }

    this.logger.log(`Applying bookings to ${slots.length} slots`);

    // Group slots by tutorId so we only query sessions once per tutor instead of per availability
    const slotsByTutor = new Map<string, Slot[]>();
    slots.forEach((slot) => {
      if (!slot.tutorId) {
        return;
      }
      if (!slotsByTutor.has(slot.tutorId)) {
        slotsByTutor.set(slot.tutorId, []);
      }
      slotsByTutor.get(slot.tutorId)!.push(slot);
    });

    // Get bookings for all tutors
    const bookingPromises = Array.from(slotsByTutor.keys()).map(async (tutorId) => {
      try {
        const sessions = await this.tutoringSessionService.getSessionsByTutor(tutorId, 100);
        return { tutorId, sessions };
      } catch (error) {
        this.logger.warn(`Error getting bookings for tutor ${tutorId}:`, error);
        return { tutorId, sessions: [] as TutoringSession[] };
      }
    });

    const bookingResults = await Promise.all(bookingPromises);
    const bookingsByTutor = new Map<string, TutoringSession[]>();

    bookingResults.forEach(({ tutorId, sessions }) => {
      bookingsByTutor.set(tutorId, sessions);
    });

    // Apply bookings to slots using tutor-level session data
    return slots.map((slot) => {
      const sessions =
        (slot.tutorId ? bookingsByTutor.get(slot.tutorId) : undefined) || [];
      const slotStart = new Date(slot.startDateTime);
      const slotEnd = new Date(slot.endDateTime);

      // Find if any session overlaps with this slot
      const booking = sessions.find((session) => {
        const sessionStart = new Date(session.scheduledStart);
        const sessionEnd = new Date(session.scheduledEnd);

        // Check if session overlaps with slot (with 1 minute tolerance)
        return (
          (sessionStart <= slotEnd && sessionEnd >= slotStart) &&
          session.status !== 'cancelled' &&
          session.status !== 'declined'
        );
      });

      if (booking) {
        return {
          ...slot,
          isBooked: true,
          bookedBy: booking.studentId,
          sessionId: booking.id,
          bookingId: booking.id,
          bookedAt: booking.createdAt,
        };
      }

      return slot;
    });
  }

  /**
   * Filter available slots (not booked and future)
   */
  getAvailableSlots(slots: Slot[]): Slot[] {
    const now = new Date();
    const availableSlots = slots.filter((slot) => {
      const slotStart = new Date(slot.startDateTime);
      const isFuture = slotStart > now;
      const isNotBooked = !slot.isBooked;

      return isFuture && isNotBooked;
    });

    this.logger.log(`Filtered ${availableSlots.length} available slots from ${slots.length} total slots`);
    return availableSlots;
  }

  /**
   * Check if a specific slot is available
   */
  isSlotAvailable(slot: Slot): boolean {
    const now = new Date();
    const slotStart = new Date(slot.startDateTime);
    const isFuture = slotStart > now;
    const isNotBooked = !slot.isBooked;

    return isFuture && isNotBooked;
  }

  /**
   * Group slots by date
   */
  groupSlotsByDate(slots: Slot[]): Record<string, { date: Date; slots: Slot[] }> {
    const grouped: Record<string, { date: Date; slots: Slot[] }> = {};

    slots.forEach((slot) => {
      const date = new Date(slot.startDateTime);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      const localMidnight = new Date(y, date.getMonth(), date.getDate());

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: localMidnight,
          slots: [],
        };
      }

      grouped[dateKey].slots.push(slot);
    });

    // Sort slots by time within each day
    Object.keys(grouped).forEach((dateKey) => {
      grouped[dateKey].slots.sort(
        (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
      );
    });

    return grouped;
  }

  /**
   * Format slot info for display
   */
  formatSlotInfo(slot: Slot) {
    const startTime = new Date(slot.startDateTime);
    const endTime = new Date(slot.endDateTime);

    return {
      id: slot.id,
      date: startTime.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      startTime: startTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      endTime: endTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      duration: '1h',
      course: slot.course,
      location: slot.location,
      description: slot.description,
      tutorId: slot.tutorId,
      tutorEmail: slot.tutorEmail,
      isAvailable: this.isSlotAvailable(slot),
      isBooked: slot.isBooked,
      bookedBy: slot.bookedBy,
    };
  }

  /**
   * Get consecutive available slots (for longer sessions in the future)
   */
  getConsecutiveAvailableSlots(slots: Slot[], count: number = 1): Slot[][] {
    const availableSlots = this.getAvailableSlots(slots);
    const consecutiveGroups: Slot[][] = [];

    for (let i = 0; i <= availableSlots.length - count; i++) {
      const group: Slot[] = [];
      let isConsecutive = true;

      for (let j = 0; j < count; j++) {
        const currentSlot = availableSlots[i + j];

        if (!currentSlot) {
          isConsecutive = false;
          break;
        }

        if (j > 0) {
          const prevSlot = availableSlots[i + j - 1];
          const currentStart = new Date(currentSlot.startDateTime);
          const prevEnd = new Date(prevSlot.endDateTime);

          // Check that they are consecutive (max 1 minute difference for tolerance)
          if (Math.abs(currentStart.getTime() - prevEnd.getTime()) > 60000) {
            isConsecutive = false;
            break;
          }
        }

        group.push(currentSlot);
      }

      if (isConsecutive && group.length === count) {
        consecutiveGroups.push(group);
      }
    }

    return consecutiveGroups;
  }

  /**
   * Validate that a slot can be booked
   */
  validateSlotForBooking(slot: Slot): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!slot) {
      errors.push('Slot no encontrado');
      return { isValid: false, errors };
    }

    if (slot.isBooked) {
      errors.push(`Este horario ya está reservado por ${slot.bookedBy || 'otro estudiante'}`);
    }

    const now = new Date();
    const slotStart = new Date(slot.startDateTime);

    if (slotStart <= now) {
      errors.push('No se puede reservar un horario que ya pasó');
    }

    // Verify it's not too soon (minimum 1 hour in advance)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    if (slotStart < oneHourFromNow) {
      errors.push('Debe reservar con al menos 1 hora de anticipación');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check slot availability in real time
   */
  async checkSlotAvailabilityRealTime(slot: Slot): Promise<{
    available: boolean;
    reason: string;
    booking?: TutoringSession | null;
  }> {
    try {
      // Get sessions for this tutor
      const sessions = await this.tutoringSessionService.getSessionsByTutor(
        slot.tutorId || '',
        100,
      );

      const slotStart = new Date(slot.startDateTime);
      const slotEnd = new Date(slot.endDateTime);

      // Find if any session overlaps with this slot
      const existingBooking = sessions.find((session) => {
        const sessionStart = new Date(session.scheduledStart);
        const sessionEnd = new Date(session.scheduledEnd);

        return (
          sessionStart <= slotEnd &&
          sessionEnd >= slotStart &&
          session.status !== 'cancelled' &&
          session.status !== 'declined'
        );
      });

      if (existingBooking) {
        this.logger.log(
          ` Slot ${slot.id} already booked in real time by ${existingBooking.studentId}`,
        );
        return {
          available: false,
          reason: `Este horario ya fue reservado por otro estudiante`,
          booking: existingBooking,
        };
      }

      this.logger.log(` Slot ${slot.id} available in real time`);
      return {
        available: true,
        reason: 'Slot disponible',
        booking: null,
      };
    } catch (error) {
      this.logger.error('Error checking availability in real time:', error);
      return {
        available: false,
        reason: 'Error verificando disponibilidad',
        booking: null,
      };
    }
  }

  /**
   * Extract time from datetime string
   */
  extractTimeFromDateTime(dateTime: Date | string): string | null {
    if (!dateTime) return null;
    const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
    if (isNaN(date.getTime())) return null;
    return date.toTimeString().substring(0, 5); // Format HH:MM
  }

  /**
   * Generate hourly slots from time range
   */
  generateHourlySlotsFromTimeRange(startTime: string, endTime: string): string[] {
    const slots: string[] = [];
    const start = this.parseTime(startTime);
    const end = this.parseTime(endTime);

    for (let hour = start; hour < end; hour++) {
      const timeString = `${hour.toString().padStart(2, '0')}:00`;
      slots.push(timeString);
    }

    return slots;
  }

  /**
   * Parse time string to hour number
   */
  parseTime(timeString: string): number {
    const [hours] = timeString.split(':').map(Number);
    return hours;
  }
}
