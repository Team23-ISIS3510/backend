import { Controller, Get, Query, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { TutorService } from './tutor.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Tutors')
@Controller('tutors')
export class TutorController {
  private readonly logger = new Logger(TutorController.name);

  constructor(private readonly tutorService: TutorService) {}

  @ApiOperation({ summary: 'Get all tutors' })
  @ApiResponse({ status: 200, description: 'List of all tutors.' })
  @Get()
  async getAllTutors() {
    try {
      const tutors = await this.tutorService.getAllTutors();
      return {
        success: true,
        tutors,
        count: tutors.length,
      };
    } catch (error) {
      this.logger.error('Error fetching tutors:', error);
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching tutors',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Search tutors by name or course' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  @ApiQuery({ name: 'q', required: false, description: 'Search term' })
  @Get('search')
  async searchTutors(@Query('q') searchTerm?: string) {
    try {
      const tutors = await this.tutorService.searchTutors(searchTerm);
      return {
        success: true,
        tutors,
        count: tutors.length,
        searchTerm: searchTerm || '',
      };
    } catch (error) {
      this.logger.error('Error searching tutors:', error);
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error searching tutors',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get tutors by course ID' })
  @ApiResponse({ status: 200, description: 'Tutors teaching the course.' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @Get('by-course/:courseId')
  async getTutorsByCourse(@Param('courseId') courseId: string) {
    try {
      if (!courseId || !courseId.trim()) {
        throw new HttpException('courseId is required', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Getting tutors for course: ${courseId}`);
      const tutors = await this.tutorService.getTutorsByCourse(courseId);

      return {
        success: true,
        tutors,
        count: tutors.length,
        courseId,
      };
    } catch (error) {
      this.logger.error('Error fetching tutors by course:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching tutors by course',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get tutor details by ID' })
  @ApiResponse({ status: 200, description: 'Tutor details.' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID (email)' })
  @Get(':tutorId')
  async getTutorById(@Param('tutorId') tutorId: string) {
    try {
      if (!tutorId || !tutorId.trim()) {
        throw new HttpException('tutorId is required', HttpStatus.BAD_REQUEST);
      }

      const tutor = await this.tutorService.getTutorById(tutorId);

      if (!tutor) {
        throw new HttpException('Tutor not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        tutor,
      };
    } catch (error) {
      this.logger.error('Error fetching tutor:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching tutor',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get tutor statistics' })
  @ApiResponse({ status: 200, description: 'Tutor statistics.' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID (email)' })
  @Get(':tutorId/stats')
  async getTutorStats(@Param('tutorId') tutorId: string) {
    try {
      if (!tutorId || !tutorId.trim()) {
        throw new HttpException('tutorId is required', HttpStatus.BAD_REQUEST);
      }

      const stats = await this.tutorService.getTutorStats(tutorId);

      return {
        success: true,
        stats,
      };
    } catch (error) {
      this.logger.error('Error fetching tutor stats:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching tutor stats',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get tutor availability' })
  @ApiResponse({ status: 200, description: 'Tutor availability.' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID (email)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of results' })
  @Get(':tutorId/availability')
  async getTutorAvailability(
    @Param('tutorId') tutorId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!tutorId || !tutorId.trim()) {
        throw new HttpException('tutorId is required', HttpStatus.BAD_REQUEST);
      }

      const limitNum = limit ? parseInt(limit, 10) : 20;
      const availability = await this.tutorService.getTutorAvailability(tutorId, limitNum);

      return {
        success: true,
        availability,
        count: availability.length,
        tutorId,
      };
    } catch (error) {
      this.logger.error('Error fetching tutor availability:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching tutor availability',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

