import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AvailabilityRepository } from '../availability/availability.repository';
import { TutorOccupancyDto } from './dto/tutor-occupancy.dto';
import { DemandMetricsDto } from './dto/demand-metrics.dto';
import * as admin from 'firebase-admin';

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

  /**
   * BQ4: Get tutor occupancy analytics for last 2 years
   * Compares session volume with available hours per tutor-subject combination
   * Separates metrics by high-demand and normal demand periods
   * 
   * High-demand periods (academic calendar):
   * - Mar 1-15, May 17-31, Sep 13-27, Nov 29 - Dec 6
   * 
   * @returns Array of metrics for each tutor-subject combination
   */
  async getTutorOccupancyAnalytics(): Promise<TutorOccupancyDto[]> {
    try {
      this.logger.log('BQ4: Starting tutor occupancy analytics calculation');

      // Calculate dates: last 2 years
      const analysisEndDate = new Date();
      const analysisStartDate = new Date();
      analysisStartDate.setFullYear(analysisStartDate.getFullYear() - 2);

      this.logger.log(
        `Analyzing period from ${analysisStartDate.toISOString()} to ${analysisEndDate.toISOString()}`,
      );

      // Fetch all sessions (non-cancelled) in date range
      const sessions = await this.fetchSessionsByDateRange(analysisStartDate, analysisEndDate);
      this.logger.log(`Fetched ${sessions.length} sessions in analysis period`);

      if (sessions.length === 0) {
        this.logger.warn('No sessions found in analysis period');
        return [];
      }

      // Group sessions by tutorId + subject
      const sessionsByTutorSubject = this.groupSessionsByTutorSubject(sessions);

      // Calculate metrics for each group
      const results: TutorOccupancyDto[] = [];

      for (const [tutorSubjectKey, groupSessions] of sessionsByTutorSubject.entries()) {
        const [tutorId, subject] = tutorSubjectKey.split('|||');

        try {
          const metrics = await this.calculateMetricsForTutorSubject(
            tutorId,
            subject,
            groupSessions,
            analysisStartDate,
            analysisEndDate,
          );

          if (metrics) {
            results.push(metrics);
          }
        } catch (error) {
          this.logger.error(`Error calculating metrics for ${tutorId}-${subject}:`, error);
        }
      }

      this.logger.log(`BQ4: Completed analytics for ${results.length} tutor-subject combinations`);
      return results;
    } catch (error) {
      this.logger.error('BQ4: Error calculating tutor occupancy analytics:', error);
      throw error;
    }
  }

  /**
   * BQ4: Fetch tutoring sessions from date range, excluding cancelled sessions
   * Note: Filters out cancelled sessions in-memory to avoid requiring composite index
   */
  private async fetchSessionsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
      const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);

      // Query without status inequality to avoid composite index requirement
      const snapshot = await db
        .collection('tutoring_sessions')
        .where('createdAt', '>=', startTimestamp)
        .where('createdAt', '<=', endTimestamp)
        .orderBy('createdAt', 'desc')
        .get();

      // Filter out cancelled sessions in memory
      const sessions = snapshot.docs
        .filter((doc) => {
          const data = doc.data();
          return data.status !== 'cancelled';
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            tutorId: data.tutorId,
            course: data.course,
            courseId: data.courseId,
            scheduledStart: this.safeToDate(data.scheduledStart),
            scheduledEnd: this.safeToDate(data.scheduledEnd),
            startDateTime: this.safeToDate(data.startDateTime),
            endDateTime: this.safeToDate(data.endDateTime),
            scheduledDateTime: this.safeToDate(data.scheduledDateTime),
            status: data.status,
            createdAt: this.safeToDate(data.createdAt),
          };
        });

      return sessions;
    } catch (error) {
      this.logger.error('BQ4: Error fetching sessions by date range:', error);
      throw error;
    }
  }

  /**
   * BQ4: Group sessions by tutorId and subject (course name)
   */
  private groupSessionsByTutorSubject(sessions: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const session of sessions) {
      if (!session.tutorId || !session.course) {
        this.logger.warn(`BQ4: Skipping session ${session.id}: missing tutorId or course`);
        continue;
      }

      const key = `${session.tutorId}|||${session.course}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(session);
    }

    this.logger.log(`BQ4: Grouped into ${grouped.size} tutor-subject combinations`);
    return grouped;
  }

  /**
   * BQ4: Calculate occupancy metrics for a specific tutor-subject combination
   */
  private async calculateMetricsForTutorSubject(
    tutorId: string,
    subject: string,
    sessions: any[],
    analysisStartDate: Date,
    analysisEndDate: Date,
  ): Promise<TutorOccupancyDto | null> {
    try {
      // Get tutor's availability in the analysis period
      const availability = await this.availabilityRepository.findByTutorAndDateRange(
        tutorId,
        analysisStartDate,
        analysisEndDate,
        1000,
      );

      const totalAvailableHours = this.calculateTotalAvailableHours(availability);

      // Calculate session metrics
      const sessionMetrics = this.calculateSessionMetrics(sessions);

      // Calculate occupancy rate
      const occupancyRate =
        totalAvailableHours > 0
          ? (sessionMetrics.totalSessionDurationHours / totalAvailableHours) * 100
          : 0;

      const sessionsPerHour =
        totalAvailableHours > 0 ? sessions.length / totalAvailableHours : 0;

      // Calculate demand-specific metrics
      const highDemandMetrics = this.calculateDemandMetrics(
        sessions,
        analysisStartDate,
        analysisEndDate,
        true,
      );

      const normalDemandMetrics = this.calculateDemandMetrics(
        sessions,
        analysisStartDate,
        analysisEndDate,
        false,
      );

      return {
        tutorId,
        subject,
        totalSessions: sessions.length,
        totalAvailableHours,
        sessionsPerHour,
        occupancyRate,
        highDemand: highDemandMetrics,
        normalDemand: normalDemandMetrics,
      };
    } catch (error) {
      this.logger.error(
        `BQ4: Error calculating metrics for tutor ${tutorId}, subject ${subject}:`,
        error,
      );
      return null;
    }
  }

  /**
   * BQ4: Calculate total available hours from availability entries
   */
  private calculateTotalAvailableHours(availability: any[]): number {
    return availability.reduce((total, av) => {
      const start = this.safeToDate(av.startDateTime);
      const end = this.safeToDate(av.endDateTime);

      if (!start || !end) {
        return total;
      }

      const durationMs = end.getTime() - start.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      return total + durationHours;
    }, 0);
  }

  /**
   * BQ4: Calculate total session duration metrics
   */
  private calculateSessionMetrics(sessions: any[]): { totalSessionDurationHours: number } {
    let totalDurationMs = 0;

    for (const session of sessions) {
      const start =
        this.safeToDate(session.scheduledStart) || this.safeToDate(session.startDateTime);
      const end =
        this.safeToDate(session.scheduledEnd) || this.safeToDate(session.endDateTime);

      if (start && end && start < end) {
        const durationMs = end.getTime() - start.getTime();
        totalDurationMs += durationMs;
      }
    }

    return {
      totalSessionDurationHours: totalDurationMs / (1000 * 60 * 60),
    };
  }

  /**
   * BQ4: Calculate metrics for specific demand period (high/normal)
   */
  private calculateDemandMetrics(
    sessions: any[],
    analysisStartDate: Date,
    analysisEndDate: Date,
    isHighDemand: boolean,
  ): DemandMetricsDto {
    const demandSessions = sessions.filter((session) => {
      const sessionDate = this.safeToDate(session.createdAt);
      if (!sessionDate) return false;

      const isInHighDemand = this.isDateInHighDemandPeriod(sessionDate);
      return isInHighDemand === isHighDemand;
    });

    let totalDurationMs = 0;
    for (const session of demandSessions) {
      const start =
        this.safeToDate(session.scheduledStart) || this.safeToDate(session.startDateTime);
      const end =
        this.safeToDate(session.scheduledEnd) || this.safeToDate(session.endDateTime);

      if (start && end && start < end) {
        const durationMs = end.getTime() - start.getTime();
        totalDurationMs += durationMs;
      }
    }

    const totalHoursOccupied = totalDurationMs / (1000 * 60 * 60);

    // Estimate available hours for this demand period
    const availableDemandHours = this.estimateAvailableDemandHours(
      analysisStartDate,
      analysisEndDate,
      isHighDemand,
    );

    const occupancyRate =
      availableDemandHours > 0 ? (totalHoursOccupied / availableDemandHours) * 100 : 0;
    const sessionsPerHour =
      availableDemandHours > 0 ? demandSessions.length / availableDemandHours : 0;

    return {
      sessionsPerHour,
      occupancyRate,
      totalSessions: demandSessions.length,
      totalHoursOccupied,
    };
  }

  /**
   * BQ4: Get tutor occupancy analytics for a specific tutor (last 2 years)
   * Compares session volume against available hours per subject
   * @param tutorId Firebase UID of the tutor
   * @returns Array of metrics for each subject of that tutor
   */
  async getTutorOccupancyByTutorId(tutorId: string): Promise<TutorOccupancyDto[]> {
    try {
      this.logger.log(`BQ4: Starting tutor occupancy analytics for tutorId: ${tutorId}`);

      // Calculate dates: last 2 years
      const analysisEndDate = new Date();
      const analysisStartDate = new Date();
      analysisStartDate.setFullYear(analysisStartDate.getFullYear() - 2);

      this.logger.log(
        `Analyzing period from ${analysisStartDate.toISOString()} to ${analysisEndDate.toISOString()}`,
      );

      // Fetch all sessions for this tutor (non-cancelled) in date range
      const sessions = await this.fetchSessionsByTutorAndDateRange(
        tutorId,
        analysisStartDate,
        analysisEndDate,
      );
      this.logger.log(`Fetched ${sessions.length} sessions for tutor ${tutorId}`);

      if (sessions.length === 0) {
        this.logger.warn(`No sessions found for tutor ${tutorId}`);
        return [];
      }

      // Group sessions by subject
      const sessionsBySubject = this.groupSessionsBySubject(sessions);

      // Calculate metrics for each subject
      const results: TutorOccupancyDto[] = [];

      for (const [subject, groupSessions] of sessionsBySubject.entries()) {
        try {
          const metrics = await this.calculateMetricsForTutorSubject(
            tutorId,
            subject,
            groupSessions,
            analysisStartDate,
            analysisEndDate,
          );

          if (metrics) {
            results.push(metrics);
          }
        } catch (error) {
          this.logger.error(`Error calculating metrics for ${tutorId}-${subject}:`, error);
        }
      }

      this.logger.log(`BQ4: Completed analytics for tutor ${tutorId} - ${results.length} subjects`);
      return results;
    } catch (error) {
      this.logger.error(`BQ4: Error calculating tutor occupancy for ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * BQ4: Fetch tutoring sessions for specific tutor from date range
   */
  private async fetchSessionsByTutorAndDateRange(
    tutorId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
      const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);

      const snapshot = await db
        .collection('tutoring_sessions')
        .where('tutorId', '==', tutorId)
        .where('createdAt', '>=', startTimestamp)
        .where('createdAt', '<=', endTimestamp)
        .orderBy('createdAt', 'desc')
        .get();

      // Filter out cancelled sessions in memory
      const sessions = snapshot.docs
        .filter((doc) => {
          const data = doc.data();
          return data.status !== 'cancelled';
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            tutorId: data.tutorId,
            course: data.course,
            courseId: data.courseId,
            scheduledStart: this.safeToDate(data.scheduledStart),
            scheduledEnd: this.safeToDate(data.scheduledEnd),
            startDateTime: this.safeToDate(data.startDateTime),
            endDateTime: this.safeToDate(data.endDateTime),
            scheduledDateTime: this.safeToDate(data.scheduledDateTime),
            status: data.status,
            createdAt: this.safeToDate(data.createdAt),
          };
        });

      return sessions;
    } catch (error) {
      this.logger.error(`BQ4: Error fetching sessions for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * BQ4: Group sessions by subject only (for single tutor)
   */
  private groupSessionsBySubject(sessions: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const session of sessions) {
      if (!session.course) {
        this.logger.warn(`BQ4: Skipping session ${session.id}: missing course`);
        continue;
      }

      if (!grouped.has(session.course)) {
        grouped.set(session.course, []);
      }
      grouped.get(session.course)!.push(session);
    }

    this.logger.log(`BQ4: Grouped into ${grouped.size} subjects`);
    return grouped;
  }

  /**
   * BQ4: Check if a date falls within a high-demand academic period
   */
  private isDateInHighDemandPeriod(date: Date): boolean {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // High-demand periods (academic calendar):
    // Mar 1-15, May 17-31, Sep 13-27, Nov 29 - Dec 6
    const highDemandPeriods = [
      { startMonth: 3, startDay: 1, endMonth: 3, endDay: 15 },
      { startMonth: 5, startDay: 17, endMonth: 5, endDay: 31 },
      { startMonth: 9, startDay: 13, endMonth: 9, endDay: 27 },
      { startMonth: 11, startDay: 29, endMonth: 12, endDay: 6 },
    ];

    for (const period of highDemandPeriods) {
      if (period.startMonth === period.endMonth) {
        if (month === period.startMonth && day >= period.startDay && day <= period.endDay) {
          return true;
        }
      } else {
        if (month === period.startMonth && day >= period.startDay) {
          return true;
        }
        if (month === period.endMonth && day <= period.endDay) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * BQ4: Estimate available hours for a demand period
   */
  private estimateAvailableDemandHours(
    analysisStartDate: Date,
    analysisEndDate: Date,
    isHighDemand: boolean,
  ): number {
    let demandDays = 0;

    const currentDate = new Date(analysisStartDate);
    while (currentDate < analysisEndDate) {
      const isInHighDemand = this.isDateInHighDemandPeriod(currentDate);
      if (isInHighDemand === isHighDemand) {
        demandDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Conservative estimate: 8 hours/day on average
    const estimatedHoursPerDay = 8;
    return demandDays * estimatedHoursPerDay;
  }

  /**
   * BQ4: Safely convert Firestore timestamp to Date
   */
  private safeToDate(value: any): Date | null {
    if (!value) return null;

    if (value instanceof Date) return value;

    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (error) {
        this.logger.warn('BQ4: Error converting Timestamp:', error);
        return null;
      }
    }

    if (typeof value === 'string') {
      try {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      } catch (error) {
        this.logger.warn('BQ4: Error parsing date string:', error);
      }
    }

    if (typeof value === 'number') {
      try {
        return new Date(value);
      } catch (error) {
        this.logger.warn('BQ4: Error converting number to Date:', error);
      }
    }

    return null;
  }
}
