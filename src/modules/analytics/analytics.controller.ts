import { Controller, Get, Post, Body, Query, BadRequestException, Logger, Param, NotFoundException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiProperty } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService, AvailableTutorResult, ReturningTutorResult } from './analytics.service';
import { AnalyticsBookingService } from './analytics-booking.service';
import { TutorOccupancyDto } from './dto/tutor-occupancy.dto';
import { CreateBugReportDto } from './dto/bug-report.dto';
import { UserService } from '../user/user.service';

class AvailableTutorsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'ISIS3710' })
  course: string;

  @ApiProperty({ example: 4.5 })
  minRating: number;

  @ApiProperty({ example: 4 })
  withinHours: number;

  @ApiProperty({ example: { from: '2026-03-19T15:00:00.000Z', to: '2026-03-19T19:00:00.000Z' } })
  queryWindow: { from: Date; to: Date };

  @ApiProperty({ example: 3 })
  count: number;

  @ApiProperty({ isArray: true })
  tutors: AvailableTutorResult[];
}

class ReturningTutorResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'user-uid-123' })
  student: string;

  @ApiProperty({ example: 'ISIS3710' })
  course: string;

  @ApiProperty({ nullable: true, description: 'Most-booked tutor with an upcoming slot, or null if none found' })
  tutor: ReturningTutorResult | null;
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
     private readonly analyticsBookingService: AnalyticsBookingService,
    private readonly userService: UserService,
  ) {}

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
  async getDashboard(@Res() res: Response) {
    this.logger.log('BQ1: Generating dashboard');
    
    const [metrics, bq5] = await Promise.all([
      this.analyticsService.getDashboardData(),
      this.analyticsService.getBookingSuccessData(),
    ]);

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

    <!-- BQ5: Instant Booking Success Rate -->
    <div class="section">
      <h1 class="section-title">Instant Booking Success Rate</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${bq5.summary.totalBookings}</div>
          <div class="stat-label">Total Bookings</div>
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
    const manualByDay = ${JSON.stringify(bq5.manualByDay)};
    const crashes = ${JSON.stringify(metrics.crashes)};
    const bugs = ${JSON.stringify(metrics.bugs)};
    const latencyIssues = ${JSON.stringify(metrics.latencyIssues)};

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
            label: 'Manual / Other',
            data: manualByDay,
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
  </script>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
