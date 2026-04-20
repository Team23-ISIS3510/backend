import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsOccupancyUpdateService } from '../analytics/analytics-occupancy-update.service';

/**
 * Service to handle updates to occupancy collection when sessions are created/updated
 */
@Injectable()
export class TutoringSessionOccupancyUpdateService {
  private readonly logger = new Logger(TutoringSessionOccupancyUpdateService.name);

  constructor(
    private readonly occupancyUpdateService: AnalyticsOccupancyUpdateService,
  ) {}

  /**
   * Called after a new tutoring session is created
   * Updates the occupancy collection for this tutor-subject combination
   */
  async onSessionCreated(
    tutorId: string,
    subjectId: string,
    subjectName: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Session created for tutor ${tutorId}, subject ${subjectId}. Updating occupancy...`,
      );
      await this.occupancyUpdateService.updateOccupancyForTutorSubject(
        tutorId,
        subjectId,
        subjectName,
      );
    } catch (error) {
      this.logger.error(
        `Error updating occupancy after session creation for ${tutorId}-${subjectId}:`,
        error,
      );
      // Don't throw - we don't want to fail session creation if occupancy update fails
    }
  }

  /**
   * Called after a session is updated
   */
  async onSessionUpdated(
    tutorId: string,
    subjectId: string,
    subjectName: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Session updated for tutor ${tutorId}, subject ${subjectId}. Updating occupancy...`,
      );
      await this.occupancyUpdateService.updateOccupancyForTutorSubject(
        tutorId,
        subjectId,
        subjectName,
      );
    } catch (error) {
      this.logger.error(
        `Error updating occupancy after session update for ${tutorId}-${subjectId}:`,
        error,
      );
    }
  }
}
