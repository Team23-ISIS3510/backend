import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AvailabilityRepository } from '../availability/availability.repository';

export interface AvailableTutorResult {
  id: string;
  name: string;
  email: string;
  rating: number;
  hourlyRate: number | null;
  bio: string;
  profileImage: string | null;
  location: string;
  courses: string[];
  nextAvailableSlot: {
    startDateTime: Date;
    endDateTime: Date;
    location?: string;
    course?: string;
  } | null;
  availableSlotsCount: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly availabilityRepository: AvailabilityRepository,
  ) {}

  /**
   * Returns tutors for a given course that:
   *   1. Have rating > minRating (default 4.5)
   *   2. Have at least one availability block overlapping [now, now + withinHours]
   *
   * Designed to power the "available now" carousel on the student home screen.
   */
  async getAvailableTutorsForCourse(
    courseId: string,
    minRating: number = 4.5,
    withinHours: number = 4,
  ): Promise<AvailableTutorResult[]> {
    this.logger.log(
      `Available tutors – course: ${courseId}, minRating: ${minRating}, window: ${withinHours}h`,
    );

    const db = this.firebaseService.getFirestore();

    // Step 1: Tutors that teach this course
    const snapshot = await db
      .collection('users')
      .where('isTutor', '==', true)
      .where('courses', 'array-contains', courseId)
      .get();

    if (snapshot.empty) {
      this.logger.log(`No tutors found for course ${courseId}`);
      return [];
    }

    // Step 2: Keep only tutors above the rating threshold
    const candidates = snapshot.docs
      .map((doc) => {
        const raw = doc.data();
        const rating = typeof raw.rating === 'number' ? raw.rating : null;
        return { id: doc.id, raw, rating };
      })
      .filter(({ rating }) => rating !== null && (rating as number) > minRating);

    if (candidates.length === 0) {
      this.logger.log(`No tutors for course ${courseId} pass the rating threshold (>${minRating})`);
      return [];
    }

    // Step 3: For each candidate, check availability in the next [withinHours] hours.
    // We add a 1-hour lookback to catch blocks that started slightly before now but are still open.
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    const results: AvailableTutorResult[] = [];

    await Promise.all(
      candidates.map(async ({ id: tutorId, raw, rating }) => {
        try {
          const availabilities = await this.availabilityRepository.findByTutorAndDateRange(
            tutorId,
            windowStart,
            windowEnd,
          );

          // An availability is "active" if it hasn't ended yet
          const active = availabilities.filter(
            (a) => a.endDateTime && new Date(a.endDateTime) > now,
          );

          if (active.length === 0) return;

          const sorted = [...active].sort(
            (a, b) =>
              new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
          );
          const next = sorted[0];

          results.push({
            id: tutorId,
            name: raw.name ?? '',
            email: raw.email ?? '',
            rating: rating as number,
            hourlyRate:
              typeof raw.hourlyRate === 'number'
                ? raw.hourlyRate
                : typeof raw.hourly_rate === 'number'
                ? raw.hourly_rate
                : null,
            bio: raw.bio ?? '',
            profileImage: raw.profileImage ?? null,
            location: raw.location ?? 'Virtual',
            courses: Array.isArray(raw.courses) ? raw.courses : [],
            nextAvailableSlot: {
              startDateTime: new Date(next.startDateTime),
              endDateTime: new Date(next.endDateTime),
              location: next.location,
              course: next.course,
            },
            availableSlotsCount: active.length,
          });
        } catch (err) {
          this.logger.warn(`Could not check availability for tutor ${tutorId}:`, err);
        }
      }),
    );

    // Sort by highest rating first
    results.sort((a, b) => b.rating - a.rating);

    this.logger.log(
      `${results.length} of ${candidates.length} rated tutors are available for course ${courseId}`,
    );
    return results;
  }
}
