import { DemandMetricsDto } from './demand-metrics.dto';

/**
 * BQ4: DTO for tutor occupancy analytics response
 * Contains metrics for a specific tutor-subject combination
 * showing session volume vs availability
 */
export class TutorOccupancyDto {
  /**
   * Tutor's unique identifier (Firebase UID)
   */
  tutorId!: string;

  /**
   * Course/subject name
   */
  subject!: string;

  /**
   * Total number of tutoring sessions for this tutor-subject
   * across analysis period (2 years)
   */
  totalSessions!: number;

  /**
   * Total available hours for this tutor
   * Sum of (endTime - startTime) from all availability entries
   */
  totalAvailableHours!: number;

  /**
   * Sessions per hour ratio
   * Calculated as: totalSessions / totalAvailableHours
   * Indicates demand intensity
   */
  sessionsPerHour!: number;

  /**
   * Overall occupancy rate (0-1)
   * Ratio of total session duration to total available hours
   */
  occupancyRate!: number;

  /**
   * Metrics during high-demand periods
   * High demand dates per academic year:
   * - Mar 1-15
   * - May 17-31
   * - Sep 13-27
   * - Nov 29 - Dec 6
   */
  highDemand!: DemandMetricsDto;

  /**
   * Metrics during normal demand periods
   * All remaining times in the analysis window
   */
  normalDemand!: DemandMetricsDto;
}
