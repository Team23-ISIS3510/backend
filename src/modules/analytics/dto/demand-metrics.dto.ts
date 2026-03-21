/**
 * BQ4: DTO for demand metrics (high/normal)
 * Represents sessions and occupancy metrics for a specific demand period
 */
export class DemandMetricsDto {
  /**
   * Number of sessions per hour during this demand period
   */
  sessionsPerHour!: number;

  /**
   * Occupancy rate (between 0 and 1)
   * Calculated as totalHoursOccupied / totalAvailableHours
   */
  occupancyRate!: number;

  /**
   * Total sessions during this demand period
   */
  totalSessions!: number;

  /**
   * Total hours occupied during this demand period
   */
  totalHoursOccupied!: number;
}
