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
  
  // Mobile app context fields
  feature?: string;
  action?: string;
  networkType?: string;
  
  // Additional fields for LATENCY type
  endpoint?: string;
  method?: string;
  durationMs?: number;
  statusCode?: number;
}
