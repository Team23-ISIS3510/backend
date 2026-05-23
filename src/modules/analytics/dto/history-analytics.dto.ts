/**
 * DTO for creating history analytics events
 * Used in POST /analytics/history/bq16
 */
export class CreateHistoryAnalyticsEventDto {
  /**
   * Tutor's unique identifier (Firebase UID)
   */
  tutorId!: string;

  /**
   * Type of history view event
   * e.g., "history_view_opened"
   */
  eventType!: string;

  /**
   * Timestamp when the event occurred
   * ISO 8601 format: "2026-05-26T18:30:00Z"
   */
  timestamp!: string;

  /**
   * Optional metadata about the event
   */
  metadata?: Record<string, any>;
}

/**
 * DTO for BQ16 analytics response
 * Contains metrics about weekly history view usage
 */
export class BQ16HistoryAnalyticsResponseDto {
  /**
   * Weekly percentage of tutors who used history view
   * Formula: (unique tutors who used history view / total active tutors) * 100
   */
  weeklyPercentage!: number;

  /**
   * Total number of history view events during the week
   */
  totalEvents!: number;

  /**
   * Number of unique tutors who used the history view feature
   */
  uniqueTutorsUsing!: number;

  /**
   * Total number of active tutors (denominators for percentage calculation)
   * This includes all tutors who have been active in the system
   */
  totalActiveTutors!: number;

  /**
   * Start date of the week (ISO 8601)
   */
  weekStart!: string;

  /**
   * End date of the week (ISO 8601)
   */
  weekEnd!: string;

  /**
   * Breakdown of events by day
   * Useful for trend visualization
   */
  eventsByDay?: Array<{
    date: string;
    events: number;
    uniqueTutors: number;
  }>;

  /**
   * Top tutors by event count
   * Useful for engagement analysis
   */
  topTutors?: Array<{
    tutorId: string;
    tutorName: string;
    eventCount: number;
  }>;
}

/**
 * DTO for bulk history analytics response
 * Used when returning multiple weeks of data
 */
export class BQ16HistoryAnalyticsBulkResponseDto {
  /**
   * Success indicator
   */
  success!: boolean;

  /**
   * Weekly data points
   */
  weeks!: BQ16HistoryAnalyticsResponseDto[];

  /**
   * Overall average percentage across all weeks
   */
  averagePercentage!: number;

  /**
   * Trend direction: "up", "down", or "stable"
   */
  trend?: string;
}
