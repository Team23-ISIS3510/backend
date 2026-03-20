import { Controller, Get, Query, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { AnalyticsService, AvailableTutorResult, ReturningTutorResult } from './analytics.service';

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

  constructor(private readonly analyticsService: AnalyticsService) {}

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
}
