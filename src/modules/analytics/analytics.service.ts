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

export interface ReturningTutorResult extends AvailableTutorResult {
  bookingCount: number;
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

  /**
   * Returns the student's most-booked tutor for a given course, provided that
   * tutor has an open availability slot within the next [lookAheadHours] hours.
   *
   * Pipeline:
   *   1. Aggregate completed sessions → booking count per tutor for this course
   *   2. Rank tutors by booking count DESC
   *   3. Walk the ranking until we find one with upcoming availability
   */
  async getReturningTutorForStudent(
    studentId: string,
    courseId: string,
    lookAheadHours: number = 48,
  ): Promise<ReturningTutorResult | null> {
    this.logger.log(
      `Returning tutor – student: ${studentId}, course: ${courseId}, window: ${lookAheadHours}h`,
    );

    const db = this.firebaseService.getFirestore();

    // Step 1: Completed sessions for this student + course
    const sessionsSnap = await db
      .collection('tutoring_sessions')
      .where('studentId', '==', studentId)
      .where('courseId', '==', courseId)
      .where('status', '==', 'completed')
      .get();

    if (sessionsSnap.empty) {
      this.logger.log(`No completed sessions for student ${studentId} in course ${courseId}`);
      return null;
    }

    // Step 2: Aggregate booking count per tutor
    const countByTutor = new Map<string, number>();
    sessionsSnap.forEach((doc) => {
      const tutorId = doc.data().tutorId as string;
      if (tutorId) countByTutor.set(tutorId, (countByTutor.get(tutorId) ?? 0) + 1);
    });

    // Step 3: Rank by count DESC, then find the first one with upcoming availability
    const ranked = [...countByTutor.entries()].sort((a, b) => b[1] - a[1]);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + lookAheadHours * 60 * 60 * 1000);

    for (const [tutorId, bookingCount] of ranked) {
      try {
        const userDoc = await db.collection('users').doc(tutorId).get();
        if (!userDoc.exists) continue;
        const raw = userDoc.data()!;

        const availabilities = await this.availabilityRepository.findByTutorAndDateRange(
          tutorId,
          now,
          windowEnd,
        );

        const active = availabilities.filter(
          (a) => a.endDateTime && new Date(a.endDateTime) > now,
        );
        if (active.length === 0) continue;

        const sorted = [...active].sort(
          (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
        );
        const next = sorted[0];

        this.logger.log(
          `Returning tutor for student ${studentId}: ${tutorId} (booked ${bookingCount}×)`,
        );

        return {
          id: tutorId,
          name: raw.name ?? '',
          email: raw.email ?? '',
          rating: typeof raw.rating === 'number' ? raw.rating : 0,
          hourlyRate: typeof raw.hourlyRate === 'number' ? raw.hourlyRate : null,
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
          bookingCount,
        };
      } catch (err) {
        this.logger.warn(`Could not check returning tutor ${tutorId}:`, err);
      }
    }

    this.logger.log(`No returning tutor with upcoming availability for student ${studentId}`);
    return null;
  }
}
