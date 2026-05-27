import { Controller, Get, Post, Body, Query, BadRequestException, Logger, Param, NotFoundException, Res, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AnalyticsService, AvailableTutorResult, ReturningTutorResult } from './analytics.service';
import { AnalyticsBookingService } from './analytics-booking.service';
import { AnalyticsFeatureCorrelationService } from './analytics-feature-correlation.service';
import { HistoryAnalyticsService } from './analytics-history.service';
import { TutorOccupancyDto } from './dto/tutor-occupancy.dto';
import { CreateBugReportDto } from './dto/bug-report.dto';
import { CreateCarouselEventDto } from './dto/carousel-event.dto';
import { LogHomepageLoadDto } from './dto/homepage-load.dto';
import { CreateHistoryAnalyticsEventDto, BQ16HistoryAnalyticsResponseDto } from './dto/history-analytics.dto';
import { UserService } from '../user/user.service';
import { TutoringSessionService } from '../tutoring-session/tutoring-session.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';

class AvailableTutorsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'ISIS3710' })
  course!: string;

  @ApiProperty({ example: 4.5 })
  minRating!: number;

  @ApiProperty({ example: 4 })
  withinHours!: number;

  @ApiProperty({ example: { from: '2026-03-19T15:00:00.000Z', to: '2026-03-19T19:00:00.000Z' } })
  queryWindow!: { from: Date; to: Date };

  @ApiProperty({ example: 3 })
  count!: number;

  @ApiProperty({ isArray: true })
  tutors!: AvailableTutorResult[];
}

class ReturningTutorResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'user-uid-123' })
  student!: string;

  @ApiProperty({ example: 'ISIS3710' })
  course!: string;

  @ApiProperty({ nullable: true, description: 'Most-booked tutor with an upcoming slot, or null if none found' })
  tutor!: ReturningTutorResult | null;
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsBookingService: AnalyticsBookingService,
    private readonly featureCorrelationService: AnalyticsFeatureCorrelationService,
    private readonly historyAnalyticsService: HistoryAnalyticsService,
    private readonly userService: UserService,
    private readonly sessionService: TutoringSessionService,
  ) {}

  private normalizeBQ16DateRange(start: string, end: string): { weekStart: string; weekEnd: string } {
    const weekStart = new Date(start);
    const weekEnd = new Date(end);

    if (Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime())) {
      throw new BadRequestException('Query parameters "start" and "end" must be valid dates');
    }

    if (!start.includes('T')) {
      weekStart.setUTCHours(0, 0, 0, 0);
    }

    if (!end.includes('T')) {
      weekEnd.setUTCHours(23, 59, 59, 999);
    }

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    };
  }

  /**
   * GET /analytics/available-tutors?course=ISIS3710
   *
   * Returns tutors who:
   *   - Teach the requested course
   *   - Have a rating above minRating (default 4.5)
   *   - Have an open availability slot within the next withinHours hours (default 4)
   *
   * Intended to power the "Available Now" tutor carousel on the student home screen.
   */
  @Get('available-tutors')
  @ApiOperation({
    summary: 'Top-rated tutors available in the next N hours for a course',
    description:
      'Returns tutors with rating > minRating who have open availability within the next withinHours for the given course. ' +
      'Designed to populate a real-time carousel on the student home screen.',
  })
  @ApiQuery({ name: 'course', required: true, description: 'Course ID (e.g. ISIS3710)' })
  @ApiQuery({
    name: 'minRating',
    required: false,
    description: 'Minimum rating threshold (default 4.5)',
    type: Number,
  })
  @ApiQuery({
    name: 'withinHours',
    required: false,
    description: 'Availability window in hours from now (default 4)',
    type: Number,
  })
  @ApiResponse({ status: 200, type: AvailableTutorsResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or invalid course parameter' })
  async getAvailableTutors(
    @Query('course') course: string,
    @Query('minRating') minRating?: string,
    @Query('withinHours') withinHours?: string,
  ): Promise<AvailableTutorsResponseDto> {
    if (!course || !course.trim()) {
      throw new BadRequestException('Query parameter "course" is required');
    }

    const parsedMinRating = minRating !== undefined ? parseFloat(minRating) : 4.5;
    const parsedWithinHours = withinHours !== undefined ? parseFloat(withinHours) : 4;

    if (isNaN(parsedMinRating) || parsedMinRating < 0 || parsedMinRating > 5) {
      throw new BadRequestException('minRating must be a number between 0 and 5');
    }
    if (isNaN(parsedWithinHours) || parsedWithinHours <= 0) {
      throw new BadRequestException('withinHours must be a positive number');
    }

    const now = new Date();
    const tutors = await this.analyticsService.getAvailableTutorsForCourse(
      course.trim(),
      parsedMinRating,
      parsedWithinHours,
    );

    return {
      success: true,
      course: course.trim(),
      minRating: parsedMinRating,
      withinHours: parsedWithinHours,
      queryWindow: {
        from: now,
        to: new Date(now.getTime() + parsedWithinHours * 60 * 60 * 1000),
      },
      count: tutors.length,
      tutors,
    };
  }

  /**
   * BQ4: GET /analytics/tutor-occupancy
   * 
   * Returns tutor occupancy and demand analysis for the last 2 years
   * Compares session volume against available hours per tutor-subject
   * Separates metrics by high-demand and normal periods
   * 
   * High-demand academic periods:
   * - Mar 1-15, May 17-31, Sep 13-27, Nov 29 - Dec 6
   * 
   * Intended to show insights on home page and help identify
   * overbooking/underutilization of tutors by subject
   */
  @Get('tutor-occupancy')
  @ApiOperation({
    summary: 'BQ4: Tutor occupancy and demand analysis (all tutors)',
    description:
      'Calculates session volume vs available hours for each tutor-subject combination over 2 years. ' +
      'Separates metrics by high-demand academic periods.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of tutor occupancy metrics by subject',
    type: [TutorOccupancyDto],
  })
  @ApiResponse({ status: 500, description: 'Error calculating analytics' })
  async getTutorOccupancyAnalytics(): Promise<{
    success: boolean;
    count: number;
    data: TutorOccupancyDto[];
  }> {
    try {
      this.logger.log('BQ4: Fetching tutor occupancy analytics (all tutors)');
      const data = await this.analyticsService.getTutorOccupancyAnalytics();

      return {
        success: true,
        count: data.length,
        data,
      };
    } catch (error) {
      this.logger.error('BQ4: Error fetching tutor occupancy analytics:', error);
      throw error;
    }
  }

  /**
   * BQ4: GET /analytics/tutor-occupancy/:tutorId
   * 
   * Returns occupancy and demand analysis for a specific tutor (last 2 years)
   * Breaks down metrics by subject for individual tutor insight
   * 
   * @param tutorId Firebase UID OR email of the tutor (auto-resolves email to UID)
   * @returns Array of metrics for each subject this tutor teaches
   */
  @Get('tutor-occupancy/:tutorId')
  @ApiOperation({
    summary: 'BQ4: Tutor occupancy analysis by tutor ID or email',
    description:
      'Calculates session volume vs available hours for a specific tutor across all subjects. ' +
      'Shows demand metrics broken down by subject. Accepts both Firebase UID and email address.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of occupancy metrics for this tutor by subject',
    type: [TutorOccupancyDto],
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid tutorId' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  @ApiResponse({ status: 500, description: 'Error calculating analytics' })
  async getTutorOccupancyByTutorId(
    @Param('tutorId') tutorId: string,
  ): Promise<{
    success: boolean;
    tutorId: string;
    count: number;
    data: TutorOccupancyDto[];
  }> {
    try {
      if (!tutorId || !tutorId.trim()) {
        throw new BadRequestException('Parameter "tutorId" is required');
      }

      let resolvedTutorId = tutorId.trim();

      // If tutorId looks like an email, resolve it to Firebase UID
      if (tutorId.includes('@')) {
        this.logger.log(`BQ4: Email provided, resolving to UID: ${tutorId}`);
        try {
          const user = await this.userService.getUserByEmail(tutorId.trim());
          if (!user) {
            throw new NotFoundException(`Tutor with email ${tutorId} not found`);
          }
          resolvedTutorId = user.id; // Use Firebase UID
          this.logger.log(`BQ4: Resolved email ${tutorId} to UID ${resolvedTutorId}`);
        } catch (err) {
          throw new NotFoundException(`Tutor with email ${tutorId} not found`);
        }
      }

      this.logger.log(`BQ4: Fetching tutor occupancy analytics for tutorId: ${resolvedTutorId}`);
      const data = await this.analyticsService.getTutorOccupancyByTutorId(resolvedTutorId);

      return {
        success: true,
        tutorId: resolvedTutorId,
        count: data.length,
        data,
      };
    } catch (error) {
      this.logger.error(`BQ4: Error fetching tutor occupancy for ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * GET /analytics/returning-tutor?student=<uid>&course=<courseId>
   *
   * Returns the tutor the student has booked most for this course,
   * provided they have an open slot in the next 48 hours.
   * Returns null in the `tutor` field if no match is found.
   */
  @Get('returning-tutor')
  @ApiOperation({
    summary: "Student's most-booked tutor for a course with upcoming availability",
    description:
      'Aggregates the student\'s completed session history per tutor for the given course, ' +
      'ranks by booking frequency, and returns the top-ranked tutor who has an open slot ' +
      'in the next 48 hours. Designed to power the "Your Go-To Tutor" card on the course detail screen.',
  })
  @ApiQuery({ name: 'student', required: true, description: 'Firebase UID of the student' })
  @ApiQuery({ name: 'course', required: true, description: 'Course ID' })
  @ApiResponse({ status: 200, type: ReturningTutorResponseDto })
  @ApiResponse({ status: 400, description: 'Missing student or course parameter' })
  async getReturningTutor(
    @Query('student') student: string,
    @Query('course') course: string,
  ): Promise<ReturningTutorResponseDto> {
    if (!student?.trim()) {
      throw new BadRequestException('Query parameter "student" is required');
    }
    if (!course?.trim()) {
      throw new BadRequestException('Query parameter "course" is required');
    }

    const tutor = await this.analyticsService.getReturningTutorForStudent(
      student.trim(),
      course.trim(),
    );

    return {
      success: true,
      student: student.trim(),
      course: course.trim(),
      tutor,
    };
  }

  @Get('bookable-tutors')
  @ApiOperation({ summary: 'Available tutors with slot booking info' })
  @ApiQuery({ name: 'course', required: true })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiQuery({ name: 'withinHours', required: false, type: Number })
  async getBookableTutors(
    @Query('course') course: string,
    @Query('minRating') minRating?: string,
    @Query('withinHours') withinHours?: string,
  ) {
    const parsedMinRating = minRating ? parseFloat(minRating) : 4.5;
    const parsedWithinHours = withinHours ? parseFloat(withinHours) : 4;

    const tutors = await this.analyticsBookingService.getBookableTutorsForCourse(
      course.trim(),
      parsedMinRating,
      parsedWithinHours,
    );

    return {
      success: true,
      course: course.trim(),
      count: tutors.length,
      tutors,
    };
  }

  /**
   * BQ5: GET /analytics/booking-success
   *
   * Returns instant booking success rate and total bookings.
   * Instant booking = tutorApprovalStatus === 'approved' AND status === 'scheduled'
   */
  @Get('booking-success')
  @ApiOperation({
    summary: 'BQ5: Booking success rate and total bookings',
    description:
      'Returns total bookings, instant confirmations, success rate percentage, ' +
      'and a 7-day daily breakdown for instant vs manual bookings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking success metrics',
    schema: {
      example: {
        success: true,
        totalBookings: 120,
        instantConfirmations: 95,
        successRate: 79.17,
        dates: ['2026-04-13', '2026-04-14'],
        instantByDay: [10, 8],
        failedByDay: [3, 2],
      },
    },
  })
  async getBookingSuccess() {
    try {
      const data = await this.analyticsService.getBookingSuccessData();
      return {
        success: true,
        ...data.summary,
        dates: data.dates,
        instantByDay: data.instantByDay,
        failedByDay: data.failedByDay,
      };
    } catch (error) {
      this.logger.error('BQ5: Error fetching booking success data:', error);
      throw error;
    }
  }

  /**
   * BQ1: POST /analytics/bug
   *
   * Receives bug reports from the Kotlin mobile app
   * Stores crash reports, bugs, and other telemetry data
   */
  @Post('bug')
  @ApiOperation({
    summary: 'BQ1: Submit a bug report from mobile app',
    description: 'Receives and stores bug reports including crashes, bugs, and latency issues from the mobile app',
  })
  @ApiResponse({ status: 201, description: 'Bug report saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async createBugReport(@Body() dto: CreateBugReportDto) {
    this.logger.log(`BQ1: Received bug report - Type: ${dto.type}`);
    
    const timestamp = dto.timestamp ? new Date(dto.timestamp) : new Date();
    
    const reportId = await this.analyticsService.saveBugReport(
      dto.type,
      dto.message,
      dto.deviceModel,
      timestamp,
      {
        feature: dto.feature,
        action: dto.action,
        networkType: dto.networkType,
        endpoint: dto.endpoint,
        method: dto.method,
        durationMs: dto.durationMs,
        statusCode: dto.statusCode,
      },
    );

    return {
      success: true,
      reportId,
      message: 'Bug report saved successfully',
    };
  }

  /**
   * BQ2: POST /analytics/event
   * Receives carousel interaction events from the Flutter app.
   */
  @Post('event')
  @ApiOperation({
    summary: 'BQ2: Track a carousel interaction event',
    description: 'Stores results_shown, tutor_clicked, and booking_completed events for the tutor carousel.',
  })
  @ApiResponse({ status: 201, description: 'Event saved successfully' })
  async createCarouselEvent(@Body() dto: CreateCarouselEventDto) {
    await this.analyticsService.saveCarouselEvent(dto.event, dto.courseId, {
      tutorId: dto.tutorId,
      tutorRating: dto.tutorRating,
      resultCount: dto.resultCount,
      countdownMinutes: dto.countdownMinutes,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    });
    return { success: true };
  }

  /**
   * BQ9: GET /analytics/profile-update-stats
   *
   * Returns how often tutors update their profile and which fields
   * are most frequently changed.
   */
  @Get('profile-update-stats')
  @ApiOperation({
    summary: 'BQ9: Tutor profile optimization usage',
    description:
      'Aggregates profile_updates logs to show update frequency per field, ' +
      'total updates, and number of active tutors who have edited their profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile update statistics',
    schema: {
      example: {
        success: true,
        totalUpdates: 42,
        activeTutors: 8,
        fields: [
          { field: 'description', count: 15 },
          { field: 'courses', count: 12 },
        ],
      },
    },
  })
  async getProfileUpdateStats() {
    try {
      const data = await this.analyticsService.getProfileUpdateStats();
      return { success: true, ...data };
    } catch (error) {
      this.logger.error('BQ9: Error fetching profile update stats:', error);
      throw error;
    }
  }

  /**
   * BQ10: GET /analytics/booking-source-stats
   *
   * Returns breakdown of sessions booked via carousel vs standard search.
   */
  @Get('booking-source-stats')
  @ApiOperation({
    summary: 'BQ10: Booking source breakdown — carousel vs standard search',
    description: 'Returns total sessions, carousel bookings, other bookings, and carousel percentage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking source statistics',
    schema: {
      example: {
        success: true,
        totalSessions: 200,
        carouselBookings: 80,
        otherBookings: 120,
        carouselPercentage: 40,
      },
    },
  })
  async getBookingSourceStats() {
    try {
      const data = await this.analyticsService.getBookingSourceStats();
      return { success: true, ...data };
    } catch (error) {
      this.logger.error('BQ10: Error fetching booking source stats:', error);
      throw error;
    }
  }

  /**
   * BQ11: GET /analytics/peak-session-hours
   *
   * Returns the top N weekly time blocks (weekday + hour) by session volume.
   */
  @Get('peak-session-hours')
  @ApiOperation({
    summary: 'BQ11: Peak tutoring session hours (weekly)',
    description:
      'Aggregates scheduled tutoring sessions by weekday and hour, returning the top N time blocks and a heatmap-ready dataset.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of top time blocks to return (default 5)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Peak session hours analytics',
    schema: {
      example: {
        success: true,
        timezone: 'UTC',
        totalSessions: 240,
        topHours: [
          { dayOfWeek: 2, hourOfDay: 10, count: 18 },
          { dayOfWeek: 3, hourOfDay: 15, count: 17 },
        ],
        heatmap: [{ dayOfWeek: 0, hourOfDay: 0, count: 0 }],
      },
    },
  })
  async getPeakSessionHours(@Query('limit') limit?: string) {
    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 5;
    if (limit !== undefined && (isNaN(parsedLimit) || parsedLimit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    try {
      const data = await this.analyticsService.getPeakSessionHours(parsedLimit);
      return { success: true, ...data };
    } catch (error) {
      this.logger.error('BQ11: Error fetching peak session hours:', error);
      throw error;
    }
  }

  /**
   * BQ15: POST /analytics/homepage-load
   * Receives homepage load time telemetry from the mobile app (non-blocking fire-and-forget).
   */
  @Post('homepage-load')
  @ApiOperation({
    summary: 'BQ15: Log homepage load time telemetry',
    description:
      'Receives and stores homepage load time measurements from the mobile app for performance monitoring. ' +
      'Start time is when the homepage opens; end time is when all data (sessions, subjects) is rendered.',
  })
  @ApiResponse({ status: 201, description: 'Telemetry logged successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async logHomepageLoad(@Body() dto: LogHomepageLoadDto) {
    this.logger.log(`BQ15: Received homepage load event – ${dto.load_time_ms}ms, connectivity: ${dto.connectivity_status}`);

    const docId = await this.analyticsService.logHomepageLoadTime(
      dto.load_time_ms,
      dto.connectivity_status,
      dto.user_id,
    );

    return {
      success: true,
      docId,
      message: 'Homepage load time logged successfully',
    };
  }

  /**
   * BQ15: GET /analytics/homepage-load-metrics
   * Returns computed homepage performance metrics.
   */
  @Get('homepage-load-metrics')
  @ApiOperation({
    summary: 'BQ15: Homepage load time performance metrics',
    description:
      'Returns average homepage load time and the percentage of sessions exceeding the 2-second threshold.',
  })
  @ApiResponse({
    status: 200,
    description: 'Homepage load time metrics',
    schema: {
      example: {
        success: true,
        totalSessions: 150,
        avgLoadTimeMs: 1450,
        failureCount: 30,
        failurePercentage: 20,
      },
    },
  })
  async getHomepageLoadMetrics() {
    try {
      const data = await this.analyticsService.getHomepageLoadMetrics();
      return { success: true, ...data };
    } catch (error) {
      this.logger.error('BQ15: Error fetching homepage load metrics:', error);
      throw error;
    }
  }

  /**
   * BQ1: GET /analytics/dashboard
   *
   * Returns an HTML dashboard with minimalist design visualizing:
   * - System Stability: Crashes, User-Reported Bugs, and Latency Issues (7-day line chart)
   *
   * Latency Issue: API request that exceeded 2-second threshold
   */
  @Get('dashboard')
  @ApiOperation({
    summary: 'BQ1: System Stability Dashboard',
    description: 'Minimalist dashboard with 7-day trend visualization for crashes, bugs, and slow API requests (>2s)',
  })
  @ApiResponse({ status: 200, description: 'HTML dashboard page', content: { 'text/html': {} } })
  @ApiQuery({ name: 'start', required: false, example: '2026-05-25' })
  @ApiQuery({ name: 'end', required: false, example: '2026-05-31' })
  async getDashboard(
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    this.logger.log('BQ1: Generating dashboard');
    
    const [metrics, bq5, bq2, bq10, bqFc, bq15, bq11, bq9] = await Promise.all([
      this.analyticsService.getDashboardData(),
      this.analyticsService.getBookingSuccessData(),
      this.analyticsService.getBQ2DashboardData(),
      this.analyticsService.getBookingSourceStats(),
      this.featureCorrelationService.getStudentFeatureCorrelation(),
      this.analyticsService.getHomepageLoadMetrics(),
      this.analyticsService.getPeakSessionHours(5),
      this.analyticsService.getProfileUpdateStats(),
    ]);

    // Fetch BQ16 with error handling
    let bq16: BQ16HistoryAnalyticsResponseDto = {
      weeklyPercentage: 0,
      totalEvents: 0,
      uniqueTutorsUsing: 0,
      totalActiveTutors: 0,
      weekStart: new Date().toISOString(),
      weekEnd: new Date().toISOString(),
      eventsByDay: [],
      topTutors: [],
    };

    try {
      if (start && end) {
        const { weekStart, weekEnd } = this.normalizeBQ16DateRange(start, end);
        bq16 = await this.historyAnalyticsService.calculateBQ16Weekly(weekStart, weekEnd);
      } else {
        bq16 = await this.historyAnalyticsService.getCurrentWeekBQ16();
      }
    } catch (error) {
      this.logger.warn('BQ16: Failed to fetch current week metrics, using fallback:', error);
    }

    // Rank by abs(correlation) vs booking frequency for the chart; keep all for the table.
    const bqFcRanked = [...bqFc.features]
      .filter((f) => !f.lowSupport)
      .sort(
        (a, b) =>
          Math.abs(b.bookingFrequency.correlation) - Math.abs(a.bookingFrequency.correlation),
      );

    const bq11DayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bq11Rows = bq11.topHours.length
      ? bq11.topHours
          .map((slot, index) => {
            const dayLabel = bq11DayLabels[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`;
            const hourLabel = `${String(slot.hourOfDay).padStart(2, '0')}:00`;
            return `
              <tr style="border-bottom:1px solid #f4f4f5">
                <td style="padding:0.5rem 0.5rem">${index + 1}</td>
                <td style="padding:0.5rem 0.5rem; font-weight:600">${dayLabel} ${hourLabel}</td>
                <td style="padding:0.5rem 0.5rem">${slot.count}</td>
              </tr>`;
          })
          .join('')
      : `
          <tr>
            <td style="padding:0.75rem 0.5rem; color:var(--muted)" colspan="3">No session data available.</td>
          </tr>`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Stability</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #f4f4f5;
      --card: #ffffff;
      --text: #18181b;
      --muted: #71717a;
      --crash: #ef4444;
      --bug: #f59e0b;
      --latency: #8b5cf6;
      --instant: #10b981;
      --manual: #6b7280;
      --impression: #3b82f6;
      --click: #f59e0b;
      --booking: #10b981;
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      margin: 0 0 2rem 0;
      color: var(--text);
    }
    
    h2 {
      font-size: 0.875rem;
      font-weight: 600;
      margin: 0 0 1rem 0;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid #e4e4e7;
    }
    
    .stat-value {
      font-size: 2.25rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 0.5rem;
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stat-card.crashes .stat-value {
      color: var(--crash);
    }
    
    .stat-card.bugs .stat-value {
      color: var(--bug);
    }
    
    .stat-card.latency .stat-value {
      color: var(--latency);
    }

    .stat-card.instant .stat-value {
      color: var(--instant);
    }

    .stat-card.rate .stat-value {
      color: var(--instant);
    }

    .section {
      margin-top: 3rem;
    }

    .section-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 1.5rem 0;
      color: var(--text);
    }
    
    .chart-card {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid #e4e4e7;
    }
    
    canvas {
      max-height: 350px;
    }
    
    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }
      
      h1 {
        font-size: 1.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>7-Day System Stability</h1>
    
    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card crashes">
        <div class="stat-value">${metrics.summary.crashes}</div>
        <div class="stat-label">Crashes</div>
      </div>
      <div class="stat-card bugs">
        <div class="stat-value">${metrics.summary.bugs}</div>
        <div class="stat-label">Reported Bugs</div>
      </div>
      <div class="stat-card latency">
        <div class="stat-value">${metrics.summary.latencyIssues}</div>
        <div class="stat-label">Slow Requests (>2s)</div>
      </div>
    </div>
    
    <!-- Trend Chart -->
    <div class="chart-card">
      <h2>Issues Over Time</h2>
      <canvas id="stabilityChart"></canvas>
    </div>

    <!-- BQ3: Booking Cancellation Rate -->
    <div class="section">
      <h1 class="section-title">Booking Reliability</h1>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${metrics.summary.cancellationRate}%</div>
          <div class="stat-label">Cancellation Rate</div>
          <div style="font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.8;">Cancelled <12h before start</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${metrics.summary.totalCancellations}</div>
          <div class="stat-label">Late Cancellations</div>
        </div>
      </div>
    </div>

    <!-- BQ5: Instant Booking Success Rate -->
    <div class="section">
      <h1 class="section-title">Instant Booking Success Rate</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${bq5.summary.totalInstantAttempts}</div>
          <div class="stat-label">Total Instant Attempts</div>
        </div>
        <div class="stat-card instant">
          <div class="stat-value">${bq5.summary.instantConfirmations}</div>
          <div class="stat-label">Instant Confirmations</div>
        </div>
        <div class="stat-card rate">
          <div class="stat-value">${bq5.summary.successRate}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
      </div>

      <div class="chart-card">
        <h2>Instant vs Manual Bookings (Last 7 Days)</h2>
        <canvas id="bookingChart"></canvas>
      </div>
    </div>

    <!-- BQ10: Booking Source -->
    <div class="section">
      <h1 class="section-title">Booking Source — Carousel vs Search (BQ10)</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${bq10.totalSessions}</div>
          <div class="stat-label">Total Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--booking)">${bq10.carouselBookings}</div>
          <div class="stat-label">From Carousel</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--manual)">${bq10.otherBookings}</div>
          <div class="stat-label">From Search / Other</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--impression)">${bq10.carouselPercentage}%</div>
          <div class="stat-label">Carousel Share</div>
        </div>
      </div>

      <div class="chart-card">
        <h2>Carousel vs Other Bookings</h2>
        <canvas id="bookingSourceChart"></canvas>
      </div>
    </div>

    <!-- BQ9: Tutor Profile Optimization Usage -->
    <div class="section">
      <h1 class="section-title">Tutor Profile Optimization Usage (BQ9)</h1>
      <p style="color:var(--muted); margin-top:-0.75rem; margin-bottom:1.25rem; max-width:70ch">
        How often do tutors update their profiles? Which fields are most frequently changed?
        Based on <strong>${bq9.totalUpdates}</strong> updates from <strong>${bq9.activeTutors}</strong> active tutors.
      </p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${bq9.totalUpdates}</div>
          <div class="stat-label">Total Profile Updates</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--instant)">${bq9.activeTutors}</div>
          <div class="stat-label">Active Tutors</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--impression)">${bq9.fields.length > 0 ? bq9.fields[0].field : '—'}</div>
          <div class="stat-label">Most Updated Field</div>
        </div>
      </div>

      <div class="chart-card">
        <h2>Updates Per Field</h2>
        <canvas id="bq9Chart"></canvas>
      </div>
    </div>

    <!-- BQ11: Peak Campus Study Hours -->
    <div class="section">
      <h1 class="section-title">Peak Campus Study Hours (BQ11)</h1>
      <p style="color:var(--muted); margin-top:-0.75rem; margin-bottom:1.25rem; max-width:70ch">
        Top 5 weekly time blocks by scheduled session volume (timezone: ${bq11.timezone}).
        Based on <strong>${bq11.totalSessions}</strong> sessions.
      </p>

      <div class="chart-card" style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse; font-size:0.875rem">
          <thead>
            <tr style="text-align:left; color:var(--muted); border-bottom:1px solid #e4e4e7">
              <th style="padding:0.5rem 0.5rem">#</th>
              <th style="padding:0.5rem 0.5rem">Time Block</th>
              <th style="padding:0.5rem 0.5rem">Sessions</th>
            </tr>
          </thead>
          <tbody>
            ${bq11Rows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- BQ2: Tutor Carousel Performance -->
    <div class="section">
      <h1 class="section-title">Tutor Carousel Performance (BQ2)</h1>

    <!-- BQ-FC: Student Feature Correlation with Booking Outcomes -->
    <div class="section">
      <h1 class="section-title">Student Feature Correlation (BQ)</h1>
      <p style="color:var(--muted); margin-top:-0.75rem; margin-bottom:1.25rem; max-width:70ch">
        Which student-side features correlate most strongly with higher booking frequency and repeat-session
        rates? Cohort: <strong>${bqFc.cohort.totalStudents}</strong> students,
        <strong>${bqFc.cohort.totalSessions}</strong> sessions over the last
        <strong>${bqFc.meta.analysisWindowDays}</strong> days.
        Avg frequency: <strong>${bqFc.cohort.averageBookingFrequency}</strong> sessions/week ·
        Avg repeat rate: <strong>${(bqFc.cohort.averageRepeatSessionRate * 100).toFixed(1)}%</strong>.
        Scoring: point-biserial correlation + uplift (mean_with − mean_without).
      </p>

      <div class="stats-grid" style="grid-template-columns: 1fr 1fr">
        <div class="chart-card">
          <h2>Correlation with Booking Frequency</h2>
          <canvas id="bqFcFreqChart"></canvas>
        </div>
        <div class="chart-card">
          <h2>Correlation with Repeat-Session Rate</h2>
          <canvas id="bqFcRepeatChart"></canvas>
        </div>
      </div>

      <div class="chart-card" style="margin-top:1.5rem">
        <h2>Uplift Over Time — Top Feature (Booking Frequency)</h2>
        <canvas id="bqFcTrendChart"></canvas>
      </div>

      <div class="chart-card" style="margin-top:1.5rem; overflow-x:auto">
        <h2>Ranked Features</h2>
        <table style="width:100%; border-collapse:collapse; font-size:0.875rem">
          <thead>
            <tr style="text-align:left; color:var(--muted); border-bottom:1px solid #e4e4e7">
              <th style="padding:0.5rem 0.5rem">#</th>
              <th style="padding:0.5rem 0.5rem">Feature</th>
              <th style="padding:0.5rem 0.5rem">Adoption</th>
              <th style="padding:0.5rem 0.5rem">Corr. (freq.)</th>
              <th style="padding:0.5rem 0.5rem">Uplift (sess/wk)</th>
              <th style="padding:0.5rem 0.5rem">Corr. (repeat)</th>
              <th style="padding:0.5rem 0.5rem">Uplift (repeat pp)</th>
            </tr>
          </thead>
          <tbody>
            ${bqFc.features
              .map(
                (f) => `
              <tr style="border-bottom:1px solid #f4f4f5">
                <td style="padding:0.5rem 0.5rem">${f.rankByFrequencyCorrelation ?? '—'}</td>
                <td style="padding:0.5rem 0.5rem">
                  <div style="font-weight:600">${f.label}${
                    f.lowSupport ? ' <span style="color:var(--muted); font-weight:400">· low support</span>' : ''
                  }</div>
                  <div style="color:var(--muted); font-size:0.75rem">${f.key}</div>
                </td>
                <td style="padding:0.5rem 0.5rem">${(f.adoption.adoptionRate * 100).toFixed(1)}% (${f.adoption.withFeature}/${f.adoption.withFeature + f.adoption.withoutFeature})</td>
                <td style="padding:0.5rem 0.5rem">${f.bookingFrequency.correlation.toFixed(3)}</td>
                <td style="padding:0.5rem 0.5rem">${f.bookingFrequency.uplift.toFixed(3)}</td>
                <td style="padding:0.5rem 0.5rem">${f.repeatSessionRate.correlation.toFixed(3)}</td>
                <td style="padding:0.5rem 0.5rem">${(f.repeatSessionRate.uplift * 100).toFixed(1)}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- BQ15: Homepage Load Time Performance -->
    <div class="section">
      <h1 class="section-title">Homepage Load Time Performance (BQ15)</h1>
      <p style="color:var(--muted); margin-top:-0.75rem; margin-bottom:1.25rem; max-width:70ch">
        Does the average homepage load time exceed the <strong>2-second</strong> threshold?
        Based on <strong>${bq15.totalSessions}</strong> measured sessions.
      </p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${bq15.totalSessions}</div>
          <div class="stat-label">Sessions Measured</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${bq15.avgLoadTimeMs > 2000 ? 'var(--crash)' : 'var(--instant)'}">
            ${bq15.avgLoadTimeMs} ms
          </div>
          <div class="stat-label">Avg Load Time</div>
          <div style="font-size:0.8rem;margin-top:0.4rem;opacity:0.75">
            ${bq15.avgLoadTimeMs <= 2000 ? 'Within 2 s threshold' : 'Exceeds 2 s threshold'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${bq15.failurePercentage > 20 ? 'var(--crash)' : bq15.failurePercentage > 10 ? 'var(--bug)' : 'var(--instant)'}">
            ${bq15.failurePercentage}%
          </div>
          <div class="stat-label">Sessions &gt; 2 s</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--crash)">${bq15.failureCount}</div>
          <div class="stat-label">Slow Load Events</div>
        </div>
      </div>

      <div class="chart-card">
        <h2>Load Time — Within vs Exceeds 2 s Threshold</h2>
        <canvas id="bq15Chart"></canvas>
      </div>
    </div>

    <!-- BQ16: History View Feature Usage -->
    <div class="section">
      <h1 class="section-title">History View Feature Usage (BQ16)</h1>
      <p style="color:var(--muted); margin-top:-0.75rem; margin-bottom:1.25rem; max-width:70ch">
        What percentage of tutors actively use the History View feature?
        Metric: <strong>(unique tutors using history view / total active tutors) × 100</strong>
        For week: <strong>${bq16.weekStart.split('T')[0]}</strong> to <strong>${bq16.weekEnd.split('T')[0]}</strong>
      </p>

      <div class="stats-grid">
        <div class="stat-card" style="background:linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))">
          <div class="stat-value" style="color:#10b981">${bq16.weeklyPercentage.toFixed(1)}%</div>
          <div class="stat-label">Weekly Usage Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${bq16.uniqueTutorsUsing}</div>
          <div class="stat-label">Tutors Using Feature</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${bq16.totalActiveTutors}</div>
          <div class="stat-label">Total Active Tutors</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${bq16.totalEvents}</div>
          <div class="stat-label">Total Events</div>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns: 1fr 1fr; margin-top:1.5rem">
        <div class="chart-card">
          <h2>Daily Events Trend</h2>
          <canvas id="bq16EventsChart"></canvas>
        </div>
        <div class="chart-card">
          <h2>Daily Active Tutors</h2>
          <canvas id="bq16TutorsChart"></canvas>
        </div>
      </div>

      <div class="chart-card" style="margin-top:1.5rem">
        <h2>Top 10 Tutors by Events</h2>
        <canvas id="bq16TopTutorsChart"></canvas>
      </div>
    </div>

  </div>

  <script>
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } }
      }
    };
    
    const dates = ${JSON.stringify(metrics.dates)};
    const bq5Dates = ${JSON.stringify(bq5.dates)};
    const instantByDay = ${JSON.stringify(bq5.instantByDay)};
    const failedByDay = ${JSON.stringify(bq5.failedByDay)};
    const crashes = ${JSON.stringify(metrics.crashes)};
    const bugs = ${JSON.stringify(metrics.bugs)};
    const latencyIssues = ${JSON.stringify(metrics.latencyIssues)};

    // BQ16 data
    const bq16Data = ${JSON.stringify(bq16)};
    const bq16EventsByDay = bq16Data.eventsByDay || [];
    const bq16TopTutors = bq16Data.topTutors || [];

    // System Stability Chart
    new Chart(document.getElementById('stabilityChart'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Crashes',
            data: crashes,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#ef4444'
          },
          {
            label: 'User Bugs',
            data: bugs,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b'
          },
          {
            label: 'Slow Requests (>2s)',
            data: latencyIssues,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#8b5cf6'
          }
        ]
      },
      options: {
        ...chartOptions,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            title: { display: true, text: 'Issue Count' }
          }
        }
      }
    });
    // BQ5: Booking chart
    new Chart(document.getElementById('bookingChart'), {
      type: 'bar',
      data: {
        labels: bq5Dates,
        datasets: [
          {
            label: 'Instant Confirmations',
            data: instantByDay,
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Failed / Other',
            data: failedByDay,
            backgroundColor: 'rgba(107, 114, 128, 0.4)',
            borderColor: '#6b7280',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        ...chartOptions,
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { stepSize: 1 },
            title: { display: true, text: 'Bookings' }
          }
        }
      }
    });
    // BQ10: Booking source pie chart
    new Chart(document.getElementById('bookingSourceChart'), {
      type: 'bar',
      data: {
        labels: ['Carousel', 'Search / Other'],
        datasets: [{
          data: [${bq10.carouselBookings}, ${bq10.otherBookings}],
          backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(107,114,128,0.4)'],
          borderColor: ['#10b981', '#6b7280'],
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        ...chartOptions,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Sessions' } } }
      }
    });

    // BQ2: Carousel funnel
    const bq2Dates = ${JSON.stringify(bq2.dates)};
    const bq2Impressions = ${JSON.stringify(bq2.impressions)};
    const bq2Clicks = ${JSON.stringify(bq2.clicks)};
    const bq2Bookings = ${JSON.stringify(bq2.bookings)};
    const topTutors = ${JSON.stringify(bq2.topTutors)};
    const countdownBuckets = ${JSON.stringify(bq2.countdownBuckets)};

    new Chart(document.getElementById('carouselFunnelChart'), {
      type: 'line',
      data: {
        labels: bq2Dates,
        datasets: [
          { label: 'Impressions', data: bq2Impressions, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#3b82f6' },
          { label: 'Clicks', data: bq2Clicks, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#f59e0b' },
          { label: 'Bookings', data: bq2Bookings, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#10b981' }
        ]
      },
      options: { ...chartOptions, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Events' } } } }
    });



    // BQ-FC: Student feature correlation
    const bqFcRanked = ${JSON.stringify(
      bqFcRanked.map((f) => ({
        key: f.key,
        label: f.label,
        corrFreq: f.bookingFrequency.correlation,
        corrRepeat: f.repeatSessionRate.correlation,
        trend: f.trend,
      })),
    )};

    const corrColor = (v) => v >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)';
    const corrBorder = (v) => v >= 0 ? '#10b981' : '#ef4444';

    new Chart(document.getElementById('bqFcFreqChart'), {
      type: 'bar',
      data: {
        labels: bqFcRanked.map(f => f.label),
        datasets: [{
          label: 'Correlation',
          data: bqFcRanked.map(f => f.corrFreq),
          backgroundColor: bqFcRanked.map(f => corrColor(f.corrFreq)),
          borderColor: bqFcRanked.map(f => corrBorder(f.corrFreq)),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { min: -1, max: 1, title: { display: true, text: 'Point-biserial correlation' } } }
      }
    });

    new Chart(document.getElementById('bqFcRepeatChart'), {
      type: 'bar',
      data: {
        labels: [...bqFcRanked].sort((a,b)=>Math.abs(b.corrRepeat)-Math.abs(a.corrRepeat)).map(f => f.label),
        datasets: [{
          label: 'Correlation',
          data: [...bqFcRanked].sort((a,b)=>Math.abs(b.corrRepeat)-Math.abs(a.corrRepeat)).map(f => f.corrRepeat),
          backgroundColor: [...bqFcRanked].sort((a,b)=>Math.abs(b.corrRepeat)-Math.abs(a.corrRepeat)).map(f => corrColor(f.corrRepeat)),
          borderColor: [...bqFcRanked].sort((a,b)=>Math.abs(b.corrRepeat)-Math.abs(a.corrRepeat)).map(f => corrBorder(f.corrRepeat)),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { min: -1, max: 1, title: { display: true, text: 'Point-biserial correlation' } } }
      }
    });

    const topFeature = bqFcRanked[0];
    if (topFeature && topFeature.trend && topFeature.trend.length > 0) {
      new Chart(document.getElementById('bqFcTrendChart'), {
        type: 'line',
        data: {
          labels: topFeature.trend.map(t => t.bucketStart.slice(0, 10)),
          datasets: [{
            label: topFeature.label + ' — uplift (sess/week)',
            data: topFeature.trend.map(t => t.upliftFrequency),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#6366f1',
          }]
        },
        options: { ...chartOptions, scales: { y: { title: { display: true, text: 'Uplift (sessions/week)' } } } }
      });
    }

    // BQ15: Homepage load time doughnut chart
    const bq15PassPct = ${100 - bq15.failurePercentage};
    const bq15FailPct = ${bq15.failurePercentage};
    new Chart(document.getElementById('bq15Chart'), {
      type: 'doughnut',
      data: {
        labels: ['Within 2 s (' + bq15PassPct.toFixed(1) + '%)', 'Exceeds 2 s (' + bq15FailPct.toFixed(1) + '%)'],
        datasets: [{
          data: [bq15PassPct, bq15FailPct],
          backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)'],
          borderColor: ['#10b981', '#ef4444'],
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } },
          tooltip: { callbacks: { label: (ctx) => ctx.label } }
        }
      }
    });

    // BQ9: Profile update stats bar chart
    const bq9Labels = ${JSON.stringify(bq9.fields.map(f => f.field))};
    const bq9Data = ${JSON.stringify(bq9.fields.map(f => f.count))};
    new Chart(document.getElementById('bq9Chart'), {
      type: 'bar',
      data: {
        labels: bq9Labels,
        datasets: [{
          label: 'Updates',
          data: bq9Data,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Update Count' } } }
      }
    });

    // BQ16: Daily events chart
    new Chart(document.getElementById('bq16EventsChart'), {
      type: 'bar',
      data: {
        labels: bq16EventsByDay.map(d => d.date.split('-')[2]),
        datasets: [{
          label: 'Events',
          data: bq16EventsByDay.map(d => d.events),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        ...chartOptions,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });

    // BQ16: Daily tutors chart
    new Chart(document.getElementById('bq16TutorsChart'), {
      type: 'line',
      data: {
        labels: bq16EventsByDay.map(d => d.date.split('-')[2]),
        datasets: [{
          label: 'Unique Tutors',
          data: bq16EventsByDay.map(d => d.uniqueTutors),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#10b981'
        }]
      },
      options: {
        ...chartOptions,
        scales: { y: { beginAtZero: true } }
      }
    });

    // BQ16: Top tutors chart
    if (bq16TopTutors.length > 0) {
      new Chart(document.getElementById('bq16TopTutorsChart'), {
        type: 'bar',
        data: {
          labels: bq16TopTutors.slice(0, 10).map(t => t.tutorName || t.tutorId),
          datasets: [{
            label: 'Events',
            data: bq16TopTutors.slice(0, 10).map(t => t.eventCount),
            backgroundColor: 'rgba(249, 115, 22, 0.8)',
            borderColor: '#f97316',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          ...chartOptions,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true } }
        }
      });
    }
  </script>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * GET /analytics/session-alert
   * 
   * Check for upcoming confirmed sessions for the logged-in tutor.
   * Returns the next session starting within 60 minutes.
   */
  @Get('session-alert')
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({
    summary: 'Get upcoming session alert',
    description: 'Returns the next confirmed session starting within 60 minutes for the logged-in tutor',
  })
  @ApiResponse({
    status: 200,
    description: 'Session alert data',
    schema: {
      example: {
        hasAlert: true,
        studentName: 'John Doe',
        minutesToStart: 45,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - no valid Firebase token',
  })
  async getSessionAlert(@Req() req: any) {
    const user = req.user;
    if (!user || !user.uid) {
      throw new UnauthorizedException('User ID not found in token');
    }

    const tutorId = user.uid;
    const result = await this.sessionService.findUpcomingSessionWithin60Minutes(tutorId);

    if (!result) {
      return {
        hasAlert: false,
        studentName: null,
        minutesToStart: null,
      };
    }

    return {
      hasAlert: true,
      studentName: result.studentName,
      minutesToStart: result.minutesToStart,
    };
  }

  /**
   * BQ16: POST /analytics/history/bq16
   * Receives history view events from tutors
   */
  @Post('history/bq16')
  @ApiOperation({
    summary: 'BQ16: Track history view event',
    description: 'Stores history view events for tracking weekly tutor engagement with the history feature.',
  })
  @ApiResponse({ status: 201, description: 'History view event saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async logHistoryViewEvent(@Body() dto: CreateHistoryAnalyticsEventDto) {
    this.logger.log(
      `BQ16: Received history view event for tutor ${dto.tutorId}: ${dto.eventType}`,
    );

    const event = await this.historyAnalyticsService.logHistoryViewEvent(
      dto.tutorId,
      dto.eventType,
      dto.timestamp,
      dto.metadata,
    );

    return {
      success: true,
      eventId: event.id,
      message: 'History view event logged successfully',
    };
  }

  /**
   * BQ16: GET /analytics/history/bq16
   * Returns BQ16 metrics for the current week
   */
  @Get('history/bq16')
  @ApiOperation({
    summary: 'BQ16: Weekly history view engagement metrics',
    description:
      'Returns the weekly percentage of tutors using the history view feature. ' +
      'Formula: (unique tutors using history view / total active tutors) * 100',
  })
  @ApiResponse({
    status: 200,
    description: 'BQ16 analytics for current week',
    type: BQ16HistoryAnalyticsResponseDto,
  })
  @ApiResponse({ status: 500, description: 'Error calculating analytics' })
  async getBQ16CurrentWeek() {
    try {
      this.logger.log('BQ16: Fetching current week history view analytics');
      const data = await this.historyAnalyticsService.getCurrentWeekBQ16();

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('BQ16: Error fetching current week analytics:', error);
      throw error;
    }
  }

  /**
   * BQ16: GET /analytics/history/bq16/week?start=2026-05-25&end=2026-05-31
   * Returns BQ16 metrics for a specific week
   */
  @Get('history/bq16/week')
  @ApiOperation({
    summary: 'BQ16: History view metrics for a specific week',
    description: 'Returns BQ16 metrics for a user-specified week date range.',
  })
  @ApiQuery({
    name: 'start',
    required: true,
    description: 'Week start date (ISO 8601)',
    example: '2026-05-25',
  })
  @ApiQuery({
    name: 'end',
    required: true,
    description: 'Week end date (ISO 8601)',
    example: '2026-05-31',
  })
  @ApiResponse({
    status: 200,
    description: 'BQ16 analytics for specified week',
    type: BQ16HistoryAnalyticsResponseDto,
  })
  async getBQ16SpecificWeek(
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('Query parameters "start" and "end" are required');
    }

    try {
      const { weekStart, weekEnd } = this.normalizeBQ16DateRange(start, end);
      this.logger.log(`BQ16: Fetching analytics for week ${weekStart} to ${weekEnd}`);
      const data = await this.historyAnalyticsService.calculateBQ16Weekly(weekStart, weekEnd);

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('BQ16: Error fetching weekly analytics:', error);
      throw error;
    }
  }

  /**
   * BQ16: GET /analytics/history/bq16/trend?weeks=4
   * Returns BQ16 metrics for multiple weeks (trend analysis)
   */
  @Get('history/bq16/trend')
  @ApiOperation({
    summary: 'BQ16: History view engagement trend',
    description: 'Returns BQ16 metrics for multiple weeks to analyze engagement trends over time.',
  })
  @ApiQuery({
    name: 'weeks',
    required: false,
    description: 'Number of weeks to retrieve (default: 4)',
    type: Number,
    example: 4,
  })
  @ApiResponse({
    status: 200,
    description: 'BQ16 analytics trend data',
  })
  async getBQ16Trend(@Query('weeks') weeks?: string) {
    try {
      const numberOfWeeks = weeks ? Math.min(parseInt(weeks), 12) : 4;
      this.logger.log(`BQ16: Fetching trend for ${numberOfWeeks} weeks`);
      const data = await this.historyAnalyticsService.getBQ16WeeklyTrend(numberOfWeeks);

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('BQ16: Error fetching trend analytics:', error);
      throw error;
    }
  }

  /**
   * BQ16: GET /analytics/history/bq16/daily-breakdown?start=2026-05-25&end=2026-05-31
   * Returns detailed daily breakdown of history view usage
   */
  @Get('history/bq16/daily-breakdown')
  @ApiOperation({
    summary: 'BQ16: Daily breakdown of history view events',
    description: 'Returns event count and unique tutors for each day in the specified week.',
  })
  @ApiQuery({
    name: 'start',
    required: true,
    description: 'Week start date (ISO 8601)',
    example: '2026-05-25',
  })
  @ApiQuery({
    name: 'end',
    required: true,
    description: 'Week end date (ISO 8601)',
    example: '2026-05-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily breakdown data',
  })
  async getBQ16DailyBreakdown(
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('Query parameters "start" and "end" are required');
    }

    try {
      this.logger.log(`BQ16: Fetching daily breakdown for ${start} to ${end}`);
      const data = await this.historyAnalyticsService.getWeeklyDailyBreakdown(start, end);

      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('BQ16: Error fetching daily breakdown:', error);
      throw error;
    }
  }
}
