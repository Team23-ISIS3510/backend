import { Controller, Get, Query, BadRequestException, Logger, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { AnalyticsService, AvailableTutorResult } from './analytics.service';
import { TutorOccupancyDto } from './dto/tutor-occupancy.dto';
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
<<<<<<< HEAD
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
=======
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
>>>>>>> b45f2e0cf2dd81c451dc4b9eb307c512d00f6061
  }
}
