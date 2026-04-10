import { Injectable, Logger } from '@nestjs/common';
import { OccupancyRepository } from './repositories/occupancy.repository';
import { TutoringSessionRepository } from '../tutoring-session/tutoring-session.repository';
import { AvailabilityRepository } from '../availability/availability.repository';
import { Occupancy } from './entities/occupancy.entity';

/**
 * Service that maintains the occupancy collection in sync with sessions and availabilities
 * This is called whenever a session or availability is created/updated
 */
@Injectable()
export class AnalyticsOccupancyUpdateService {
  private readonly logger = new Logger(AnalyticsOccupancyUpdateService.name);

  constructor(
    private occupancyRepository: OccupancyRepository,
    private sessionRepository: TutoringSessionRepository,
    private availabilityRepository: AvailabilityRepository,
  ) {}

  /**
   * Recalculate and update occupancy for a tutor-subject combination
   * Called when a new session or availability is created
   */
  async updateOccupancyForTutorSubject(
    tutorId: string,
    subjectId: string,
    subjectName: string,
  ): Promise<void> {
    try {
      this.logger.debug(`Updating occupancy for tutor ${tutorId}, subject ${subjectId}`);

      // Get all sessions for this tutor-subject in last 2 years
      const sessions = await this.sessionRepository.getTutorSubjectSessionsLast2Years(
        tutorId,
        subjectId,
      );

      // Get all availabilities for this tutor in last 2 years
      const availabilities = await this.availabilityRepository.getTutorAvailabilitiesLast2Years(
        tutorId,
      );

      // Filter valid sessions (COMPLETED, with scheduledStart)
      const validSessions = sessions.filter(
        s => s.scheduledStart && s.status === 'completed'
      );

      // Calculate global metrics
      const totalSessionHours = this.calculateTotalHours(validSessions);
      const totalAvailableHours = this.calculateTotalHours(availabilities);

      const occupancyRate =
        totalAvailableHours > 0 ? (totalSessionHours / totalAvailableHours) * 100 : 0;
      const sessionsPerHour =
        totalAvailableHours > 0 ? validSessions.length / totalAvailableHours : 0;

      // Split into high-demand and normal periods
      const { highDemandSessions, normalDemandSessions } =
        this.splitByDemandPeriods(validSessions);

      const { highDemandAvailabilities, normalDemandAvailabilities } =
        this.splitAvailabilitiesByDemandPeriods(availabilities);

      // Calculate high-demand metrics
      const highDemandSessionHours = this.calculateTotalHours(highDemandSessions);
      const highDemandAvailableHours = this.calculateTotalHours(highDemandAvailabilities);
      const highDemandOccupancyRate =
        highDemandAvailableHours > 0
          ? (highDemandSessionHours / highDemandAvailableHours) * 100
          : 0;
      const highDemandSessionsPerHour =
        highDemandAvailableHours > 0
          ? highDemandSessions.length / highDemandAvailableHours
          : 0;

      // Calculate normal demand metrics
      const normalDemandSessionHours = this.calculateTotalHours(normalDemandSessions);
      const normalDemandAvailableHours = this.calculateTotalHours(normalDemandAvailabilities);
      const normalDemandOccupancyRate =
        normalDemandAvailableHours > 0
          ? (normalDemandSessionHours / normalDemandAvailableHours) * 100
          : 0;
      const normalDemandSessionsPerHour =
        normalDemandAvailableHours > 0
          ? normalDemandSessions.length / normalDemandAvailableHours
          : 0;

      // Create occupancy object
      const now = new Date();
      const occupancy: Occupancy = {
        tutorId,
        subjectId,
        subjectName,
        totalAvailableHours,
        totalSessionHours,
        totalSessions: validSessions.length,
        occupancyRate,
        sessionsPerHour,
        highDemandSessions: highDemandSessions.length,
        highDemandSessionHours,
        highDemandOccupancyRate,
        highDemandSessionsPerHour,
        normalDemandSessions: normalDemandSessions.length,
        normalDemandSessionHours,
        normalDemandOccupancyRate,
        normalDemandSessionsPerHour,
        createdAt: now,
        updatedAt: now,
        lastCalculatedAt: now,
      };

      // Save to occupancy collection
      await this.occupancyRepository.save(occupancy);

      this.logger.debug(
        `Occupancy updated for tutor ${tutorId}, subject ${subjectId}. Rate: ${occupancyRate}%`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating occupancy for tutor ${tutorId}, subject ${subjectId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Recalculate all occupancy records for a tutor (all subjects)
   * Called when batch update is needed
   */
  async recalculateAllForTutor(tutorId: string): Promise<void> {
    try {
      this.logger.debug(`Recalculating all occupancy for tutor ${tutorId}`);

      // Get all sessions for this tutor
      const allSessions = await this.sessionRepository.getTutorSessionsLast2Years(tutorId);

      // Group by subject
      const sessionsBySubject = this.groupSessions(allSessions);

      // Update occupancy for each subject
      for (const [subjectId, sessions] of Object.entries(sessionsBySubject)) {
        const firstSession = (sessions as any[])[0];
        await this.updateOccupancyForTutorSubject(tutorId, subjectId, firstSession.subject);
      }
    } catch (error) {
      this.logger.error(`Error recalculating occupancy for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate total hours from array of sessions/availabilities
   */
  private calculateTotalHours(items: any[]): number {
    return items.reduce((sum, item) => {
      const start = new Date(item.startTime || item.startDateTime);
      const end = new Date(item.endTime || item.endDateTime);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return sum + diffHours;
    }, 0);
  }

  /**
   * Split sessions into high-demand and normal demand periods
   */
  private splitByDemandPeriods(sessions: any[]): any {
    const highDemandPeriods = [
      { start: '03-01', end: '03-15' }, // Mar 1-15
      { start: '05-17', end: '05-31' }, // May 17-31
      { start: '09-13', end: '09-27' }, // Sep 13-27
      { start: '11-29', end: '12-06' }, // Nov 29 - Dec 6
    ];

    const highDemandSessions = sessions.filter(session => {
      const date = new Date(session.startTime);
      const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
      return highDemandPeriods.some(
        period => monthDay >= period.start && monthDay <= period.end,
      );
    });

    const normalDemandSessions = sessions.filter(s => !highDemandSessions.includes(s));

    return { highDemandSessions, normalDemandSessions };
  }

  /**
   * Split availabilities into high-demand and normal demand periods
   */
  private splitAvailabilitiesByDemandPeriods(availabilities: any[]): any {
    const highDemandPeriods = [
      { start: '03-01', end: '03-15' },
      { start: '05-17', end: '05-31' },
      { start: '09-13', end: '09-27' },
      { start: '11-29', end: '12-06' },
    ];

    const highDemandAvailabilities = availabilities.filter(avail => {
      const date = new Date(avail.startDateTime);
      const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
      return highDemandPeriods.some(
        period => monthDay >= period.start && monthDay <= period.end,
      );
    });

    const normalDemandAvailabilities = availabilities.filter(
      a => !highDemandAvailabilities.includes(a),
    );

    return { highDemandAvailabilities, normalDemandAvailabilities };
  }

  /**
   * Group sessions by subject
   */
  private groupSessions(sessions: any[]): Record<string, any[]> {
    return sessions.reduce((groups, session) => {
      const subject = session.subject;
      if (!groups[subject]) groups[subject] = [];
      groups[subject].push(session);
      return groups;
    }, {});
  }
}
