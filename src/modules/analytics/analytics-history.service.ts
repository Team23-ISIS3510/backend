import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { UserService } from '../user/user.service';
import { HistoryAnalyticsRepository } from './repositories/history-analytics.repository';
import { HistoryAnalytics } from './entities/history-analytics.entity';
import {
  BQ16HistoryAnalyticsResponseDto,
  BQ16HistoryAnalyticsBulkResponseDto,
} from './dto/history-analytics.dto';

@Injectable()
export class HistoryAnalyticsService {
  private readonly logger = new Logger(HistoryAnalyticsService.name);

  constructor(
    private readonly historyAnalyticsRepository: HistoryAnalyticsRepository,
    private readonly firebaseService: FirebaseService,
    private readonly userService: UserService,
  ) {}

  /**
   * Log a history view event
   * Called from POST /analytics/history/bq16
   */
  async logHistoryViewEvent(
    tutorId: string,
    eventType: string,
    timestamp: string,
    metadata?: Record<string, any>,
  ): Promise<HistoryAnalytics> {
    try {
      const timestampDate = new Date(timestamp);
      const event = await this.historyAnalyticsRepository.create({
        tutorId,
        eventType,
        timestamp: timestampDate,
        metadata,
      });

      this.logger.log(
        `History view event logged for tutor ${tutorId}: ${eventType} at ${timestamp}`,
      );
      return event;
    } catch (error) {
      this.logger.error(`Error logging history view event:`, error);
      throw error;
    }
  }

  /**
   * Calculate BQ16: Weekly percentage of tutors using history view feature
   * Formula: (unique tutors who used history view / total active tutors) * 100
   *
   * @param weekStart Start date of the week (ISO 8601)
   * @param weekEnd End date of the week (ISO 8601)
   * @returns BQ16 metrics
   */
  async calculateBQ16Weekly(weekStart: string, weekEnd: string): Promise<BQ16HistoryAnalyticsResponseDto> {
    try {
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);

      this.logger.log(
        `Calculating BQ16 for week: ${weekStart} to ${weekEnd}`,
      );

      // Get all history view events for the week
      const events = await this.historyAnalyticsRepository.findByEventTypeAndDateRange(
        'history_view_opened',
        startDate,
        endDate,
      );

      // Get unique tutors who used the history view
      const uniqueTutorsUsingHistoryView = new Set(events.map(e => e.tutorId));

      // Get total active tutors from the system
      const allTutors = await this.userService.getAllTutors();
      const totalActiveTutors = allTutors.length;
      const tutorNamesById = new Map(
        allTutors.map(tutor => [tutor.id, tutor.name || tutor.email || tutor.id]),
      );

      // Calculate weekly percentage
      const weeklyPercentage =
        totalActiveTutors > 0
          ? (uniqueTutorsUsingHistoryView.size / totalActiveTutors) * 100
          : 0;

      // Group events by day
      const eventsByDay = this.groupEventsByDay(events, startDate, endDate);

      // Get top tutors by event count
      const topTutors = this.getTopTutorsByEventCount(events, tutorNamesById, 10);

      return {
        weeklyPercentage: Math.round(weeklyPercentage * 100) / 100, // Round to 2 decimals
        totalEvents: events.length,
        uniqueTutorsUsing: uniqueTutorsUsingHistoryView.size,
        totalActiveTutors,
        weekStart,
        weekEnd,
        eventsByDay,
        topTutors,
      };
    } catch (error) {
      this.logger.error(`Error calculating BQ16:`, error);
      throw error;
    }
  }

  /**
   * Get current week's BQ16 metrics
   * Current week is defined as Monday to Sunday of the current week
   */
  async getCurrentWeekBQ16(): Promise<BQ16HistoryAnalyticsResponseDto> {
    try {
      const { weekStart, weekEnd } = this.getCurrentWeekDates();
      return await this.calculateBQ16Weekly(weekStart, weekEnd);
    } catch (error) {
      this.logger.error('Error getting current week BQ16:', error);
      // Return fallback response
      return {
        weeklyPercentage: 0,
        totalEvents: 0,
        uniqueTutorsUsing: 0,
        totalActiveTutors: 0,
        weekStart: new Date().toISOString(),
        weekEnd: new Date().toISOString(),
        eventsByDay: [],
        topTutors: [],
      };
    }
  }

  /**
   * Get multiple weeks of BQ16 metrics (for trend analysis)
   *
   * @param numberOfWeeks Number of weeks to retrieve (default: 4)
   * @returns Bulk analytics response with multiple weeks
   */
  async getBQ16WeeklyTrend(numberOfWeeks: number = 4): Promise<BQ16HistoryAnalyticsBulkResponseDto> {
    try {
      this.logger.log(`Fetching BQ16 trend for ${numberOfWeeks} weeks`);

      const weeks: BQ16HistoryAnalyticsResponseDto[] = [];
      let currentWeekEnd = new Date();

      // Get data for the specified number of weeks going backwards
      for (let i = 0; i < numberOfWeeks; i++) {
        const weekEnd = new Date(currentWeekEnd);
        weekEnd.setDate(weekEnd.getDate() - i * 7);

        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6); // 7 days back

        const weekData = await this.calculateBQ16Weekly(
          weekStart.toISOString(),
          weekEnd.toISOString(),
        );
        weeks.push(weekData);
      }

      // Reverse to get chronological order (oldest to newest)
      weeks.reverse();

      // Calculate average percentage
      const averagePercentage =
        weeks.length > 0
          ? weeks.reduce((sum, w) => sum + w.weeklyPercentage, 0) / weeks.length
          : 0;

      // Determine trend
      let trend = 'stable';
      if (weeks.length >= 2) {
        const oldestPercentage = weeks[0].weeklyPercentage;
        const newestPercentage = weeks[weeks.length - 1].weeklyPercentage;
        const change = newestPercentage - oldestPercentage;

        if (change > 5) trend = 'up';
        else if (change < -5) trend = 'down';
      }

      return {
        success: true,
        weeks,
        averagePercentage: Math.round(averagePercentage * 100) / 100,
        trend,
      };
    } catch (error) {
      this.logger.error(`Error fetching BQ16 weekly trend:`, error);
      throw error;
    }
  }

  /**
   * Get detailed daily breakdown for a specific week
   */
  async getWeeklyDailyBreakdown(weekStart: string, weekEnd: string): Promise<any> {
    try {
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);

      const events = await this.historyAnalyticsRepository.findByEventTypeAndDateRange(
        'history_view_opened',
        startDate,
        endDate,
      );

      const dailyBreakdown = this.groupEventsByDay(events, startDate, endDate);

      return {
        weekStart,
        weekEnd,
        totalEvents: events.length,
        totalUniqueTutors: new Set(events.map(e => e.tutorId)).size,
        dailyBreakdown,
      };
    } catch (error) {
      this.logger.error(`Error getting weekly daily breakdown:`, error);
      throw error;
    }
  }

  /**
   * Group events by day
   * @private
   */
  private groupEventsByDay(
    events: HistoryAnalytics[],
    startDate: Date,
    endDate: Date,
  ): Array<{ date: string; events: number; uniqueTutors: number }> {
    const groupedByDay = new Map<string, Set<string>>();

    // Initialize all days in the range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (!groupedByDay.has(dateStr)) {
        groupedByDay.set(dateStr, new Set());
      }
    }

    // Group events by day
    events.forEach(event => {
      const dateStr = event.timestamp.toISOString().split('T')[0];
      if (groupedByDay.has(dateStr)) {
        groupedByDay.get(dateStr)!.add(event.tutorId);
      }
    });

    // Convert to array format
    return Array.from(groupedByDay.entries())
      .map(([date, tutorIds]) => ({
        date,
        events: events.filter(e => e.timestamp.toISOString().split('T')[0] === date).length,
        uniqueTutors: tutorIds.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get top tutors by event count
   * @private
   */
  private getTopTutorsByEventCount(
    events: HistoryAnalytics[],
    tutorNamesById: Map<string, string>,
    limit: number = 10,
  ): Array<{ tutorId: string; tutorName: string; eventCount: number }> {
    const tutorEventCounts = new Map<string, number>();

    events.forEach(event => {
      tutorEventCounts.set(
        event.tutorId,
        (tutorEventCounts.get(event.tutorId) || 0) + 1,
      );
    });

    return Array.from(tutorEventCounts.entries())
      .map(([tutorId, count]) => ({
        tutorId,
        tutorName: tutorNamesById.get(tutorId) || tutorId,
        eventCount: count,
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, limit);
  }

  /**
   * Get current week's start and end dates (Monday to Sunday)
   * @private
   */
  private getCurrentWeekDates(): { weekStart: string; weekEnd: string } {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday is 0

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysSinceMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    };
  }
}
