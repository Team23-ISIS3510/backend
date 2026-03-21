/**
 * BQ4: Entity for tutor occupancy analytics
 * Represents processed analytics data for a tutor-subject combination
 */
export interface TutorOccupancyEntity {
  // Composite key
  tutorId: string;
  subject: string;

  // Session metrics
  totalSessions: number;
  totalSessionDurationHours: number;

  // Availability metrics
  totalAvailableHours: number;

  // Derived metrics
  sessionsPerHour: number;
  occupancyRate: number;

  // Demand-specific metrics
  highDemandData: {
    sessionsCount: number;
    sessionDurationHours: number;
    sessionsPerHour: number;
    occupancyRate: number;
  };

  normalDemandData: {
    sessionsCount: number;
    sessionDurationHours: number;
    sessionsPerHour: number;
    occupancyRate: number;
  };

  // Metadata
  analysisStartDate: Date;
  analysisEndDate: Date;
  lastUpdated: Date;
}
