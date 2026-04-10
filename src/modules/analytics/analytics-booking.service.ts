import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService, AvailableTutorResult } from './analytics.service';
import { AvailabilityRepository } from '../availability/availability.repository';

export interface BookableTutorResult extends AvailableTutorResult {
  nextAvailableSlot: {
    startDateTime: Date;
    endDateTime: Date;
    location?: string;
    course?: string;
    parentAvailabilityId?: string;
    slotIndex?: number;
  } | null;
}

@Injectable()
export class AnalyticsBookingService {
  private readonly logger = new Logger(AnalyticsBookingService.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly availabilityRepository: AvailabilityRepository,
  ) {}

  async getBookableTutorsForCourse(
    courseId: string,
    minRating: number = 4.5,
    withinHours: number = 4,
  ): Promise<BookableTutorResult[]> {
    const tutors = await this.analyticsService.getAvailableTutorsForCourse(
      courseId,
      minRating,
      withinHours,
    );

    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    return await Promise.all(
      tutors.map(async (tutor) => {
        try {
          const availabilities = await this.availabilityRepository.findByTutorAndDateRange(
            tutor.id,
            windowStart,
            windowEnd,
          );

          const active = availabilities.filter(
            (a) => a.endDateTime && new Date(a.endDateTime) > now,
          );

          if (active.length === 0) return { ...tutor };

          const sorted = [...active].sort(
            (a, b) =>
              new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
          );
          const next = sorted[0];

          return {
            ...tutor,
            nextAvailableSlot: {
              ...tutor.nextAvailableSlot!,
              parentAvailabilityId: next.id,
              slotIndex: 0,
            },
          };
        } catch (err) {
          this.logger.warn(`Could not enrich tutor ${tutor.id}:`, err);
          return { ...tutor };
        }
      }),
    );
  }
}