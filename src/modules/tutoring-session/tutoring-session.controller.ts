import { Controller, Get, Post, Put, Body, Param, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { TutoringSessionService } from './tutoring-session.service';
import { GetStudentHistoryDto } from './dto/history.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { TutoringSessionReview } from './entities/tutoring-session.entity';

@ApiTags('TutoringSessions')
@Controller('tutoring-sessions')
export class TutoringSessionController {
  private readonly logger = new Logger(TutoringSessionController.name);

  constructor(private readonly sessionService: TutoringSessionService) {}

  @ApiOperation({ summary: 'Get tutoring session by id' })
  @ApiResponse({ status: 200, description: 'Session retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Session id' })
  @Get(':id')
  async getSessionById(@Param('id') id: string) {
    try {
      const session = await this.sessionService.getSessionById(id);
      return {
        success: true,
        session,
      };
    } catch (error) {
      this.logger.error(`Error getting session ${id}:`, error);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @ApiOperation({ summary: 'Get sessions for a tutor' })
  @ApiResponse({ status: 200, description: 'List of sessions for tutor.' })
  @ApiParam({ name: 'tutorId', required: true, description: 'Tutor id' })
  @ApiQuery({ name: 'limit', required: false })
  @Get('tutor/:tutorId')
  async getSessionsByTutor(@Param('tutorId') tutorId: string, @Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const sessions = await this.sessionService.getSessionsByTutor(tutorId, limitNum);
      return {
        success: true,
        sessions,
        count: sessions.length,
      };
    } catch (error) {
      this.logger.error(`Error getting sessions for tutor ${tutorId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get sessions for a student' })
  @ApiResponse({ status: 200, description: 'List of sessions for student.' })
  @ApiParam({ name: 'studentId', required: true, description: 'Student id' })
  @ApiQuery({ name: 'limit', required: false })
  @Get('student/:studentId')
  async getSessionsByStudent(@Param('studentId') studentId: string, @Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const sessions = await this.sessionService.getSessionsByStudent(studentId, limitNum);
      return {
        success: true,
        sessions,
        count: sessions.length,
      };
    } catch (error) {
      this.logger.error(`Error getting sessions for student ${studentId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get upcoming sessions for a tutor' })
  @ApiResponse({ status: 200, description: 'List of upcoming sessions for tutor.' })
  @ApiParam({ name: 'tutorId', required: true, description: 'Tutor id' })
  @Get('tutor/:tutorId/upcoming')
  async getUpcomingSessions(@Param('tutorId') tutorId: string) {
    try {
      const sessions = await this.sessionService.getUpcomingSessions(tutorId, 2);
      return {
        success: true,
        sessions,
        count: sessions.length,
      };
    } catch (error) {
      this.logger.error(`Error getting upcoming sessions for tutor ${tutorId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get previous sessions for a tutor' })
  @ApiResponse({ status: 200, description: 'List of previous sessions for tutor.' })
  @ApiParam({ name: 'tutorId', required: true, description: 'Tutor id' })
  @Get('tutor/:tutorId/previous')
  async getPreviousSessions(@Param('tutorId') tutorId: string) {
    try {
      const sessions = await this.sessionService.getPreviousSessions(tutorId, 2);
      return {
        success: true,
        sessions,
        count: sessions.length,
      };
    } catch (error) {
      this.logger.error(`Error getting previous sessions for tutor ${tutorId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Create a tutoring session' })
  @ApiResponse({ status: 201, description: 'Session created.' })
  @ApiBody({ schema: { example: { tutorId: 'string', studentId: 'string', start: 'ISO8601', end: 'ISO8601' } } })
  @Post()
  async createSession(@Body() sessionData: any) {
    try {
      const session = await this.sessionService.createSession(sessionData);
      return {
        success: true,
        session,
      };
    } catch (error) {
      this.logger.error('Error creating session:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Update a tutoring session' })
  @ApiResponse({ status: 200, description: 'Session updated.' })
  @ApiParam({ name: 'id', required: true, description: 'Session id' })
  @ApiBody({ schema: { example: { start: 'ISO8601', end: 'ISO8601', status: 'string' } } })
  @Put(':id')
  async updateSession(@Param('id') id: string, @Body() sessionData: any) {
    try {
      const session = await this.sessionService.updateSession(id, sessionData);
      return {
        success: true,
        session,
      };
    } catch (error) {
      this.logger.error(`Error updating session ${id}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get student tutoring history with tutor information' })
  @ApiResponse({ status: 200, description: 'Student history retrieved successfully.' })
  @ApiParam({ name: 'studentId', required: true, description: 'Student ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter (ISO 8601)' })
  @ApiQuery({ name: 'course', required: false, description: 'Course filter' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of sessions to return' })
  @Get('student/:studentId/history')
  async getStudentHistory(
    @Param('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('course') course?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      let sessions = await this.sessionService.getStudentTutoringHistory(studentId, limitNum);

      // Apply filters
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        sessions = this.sessionService.filterByDate(sessions, start, end);
      }

      if (course) {
        sessions = this.sessionService.filterByCourse(sessions, course);
      }

      // Get statistics
      const stats = this.sessionService.getHistoryStats(sessions);
      const uniqueCourses = this.sessionService.getUniqueCourses(sessions);

      return {
        success: true,
        sessions,
        count: sessions.length,
        stats,
        uniqueCourses,
      };
    } catch (error) {
      this.logger.error(`Error getting history for student ${studentId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get unique courses from student history' })
  @ApiResponse({ status: 200, description: 'Unique courses retrieved successfully.' })
  @ApiParam({ name: 'studentId', required: true, description: 'Student ID ' })
  @Get('student/:studentId/courses')
  async getStudentCourses(@Param('studentId') studentId: string) {
    try {
      const sessions = await this.sessionService.getSessionsByStudent(studentId, 1000);
      const courses = this.sessionService.getUniqueCourses(sessions);

      return {
        success: true,
        courses,
        count: courses.length,
      };
    } catch (error) {
      this.logger.error(`Error getting courses for student ${studentId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get history statistics for a student' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully.' })
  @ApiParam({ name: 'studentId', required: true, description: 'Student ID' })
  @Get('student/:studentId/stats')
  async getStudentStats(@Param('studentId') studentId: string) {
    try {
      const sessions = await this.sessionService.getSessionsByStudent(studentId, 1000);
      const stats = this.sessionService.getHistoryStats(sessions);

      return {
        success: true,
        stats,
      };
    } catch (error) {
      this.logger.error(`Error getting stats for student ${studentId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Add or update a review for a tutoring session' })
  @ApiResponse({ status: 200, description: 'Review saved successfully.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Session id' })
  @ApiBody({
    schema: {
      example: {
        stars: 5,
        comment: 'Great tutor!',
        reviewerEmail: 'student@example.com',
        reviewerName: 'Student Name',
      },
    },
  })
  @Post(':id/reviews')
  async addReview(@Param('id') id: string, @Body() review: Partial<TutoringSessionReview>) {
    try {
      return await this.sessionService.addReview(id, review as any);
    } catch (error) {
      this.logger.error(`Error adding review for session ${id}:`, error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get reviews for a tutoring session' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Session id' })
  @Get(':id/reviews')
  async getReviews(@Param('id') id: string) {
    try {
      return await this.sessionService.getReviews(id);
    } catch (error) {
      this.logger.error(`Error getting reviews for session ${id}:`, error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

