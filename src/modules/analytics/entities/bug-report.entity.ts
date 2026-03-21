/**
 * BQ1: Entity for bug reports and telemetry data
 * Stores crash reports, bugs, and API latency measurements
 */
export interface BugReportEntity {
  id?: string;
  type: 'CRASH' | 'BUG' | 'LATENCY';
  message: string;
  deviceModel?: string;
  timestamp: Date;
  
  // Additional fields for LATENCY type
  endpoint?: string;
  method?: string;
  durationMs?: number;
  statusCode?: number;
}
