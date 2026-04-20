import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsOccupancyUpdateService } from '../analytics/analytics-occupancy-update.service';

/**
 * Service to handle updates to occupancy collection when availabilities are created/updated
 */
@Injectable()
export class AvailabilityOccupancyUpdateService {
  private readonly logger = new Logger(AvailabilityOccupancyUpdateService.name);

  constructor(
    private readonly occupancyUpdateService: AnalyticsOccupancyUpdateService,
  ) {}

  /**
   * Called after a new availability is created
   * Re-calculates occupancy for all subjects of this tutor
   */
  async onAvailabilityCreated(tutorId: string): Promise<void> {
    try {
      this.logger.debug(`Availability created for tutor ${tutorId}. Recalculating all occupancy...`);
      await this.occupancyUpdateService.recalculateAllForTutor(tutorId);
    } catch (error) {
      this.logger.error(`Error recalculating occupancy after availability creation for ${tutorId}:`, error);
      // Don't throw - we don't want to fail availability creation if occupancy update fails
    }
  }

  /**
   * Called after an availability is updated
   */
  async onAvailabilityUpdated(tutorId: string): Promise<void> {
    try {
      this.logger.debug(`Availability updated for tutor ${tutorId}. Recalculating all occupancy...`);
      await this.occupancyUpdateService.recalculateAllForTutor(tutorId);
    } catch (error) {
      this.logger.error(`Error recalculating occupancy after availability update for ${tutorId}:`, error);
    }
  }

  /**
   * Called after an availability is deleted
   */
  async onAvailabilityDeleted(tutorId: string): Promise<void> {
    try {
      this.logger.debug(`Availability deleted for tutor ${tutorId}. Recalculating all occupancy...`);
      await this.occupancyUpdateService.recalculateAllForTutor(tutorId);
    } catch (error) {
      this.logger.error(`Error recalculating occupancy after availability deletion for ${tutorId}:`, error);
    }
  }
}
