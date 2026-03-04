import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AcademicService } from './academic.service';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  private readonly logger = new Logger(CoursesController.name);

  constructor(private readonly academicService: AcademicService) {}

  @ApiOperation({ summary: 'Get all courses' })
  @ApiResponse({ status: 200, description: 'List of courses.' })
  @ApiQuery({
    name: 'tutorId',
    required: false,
    description: 'Filter courses by tutor ID',
  })
  @Get()
  async getAllCourses(@Query('tutorId') tutorId?: string) {
    try {
      const courses = tutorId
        ? await this.academicService.getCoursesByTutor(tutorId)
        : await this.academicService.getAllCourses();

      return {
        success: true,
        courses,
        count: courses.length,
      };
    } catch (error) {
      this.logger.error('Error getting courses:', error);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get course by ID' })
  @ApiResponse({ status: 200, description: 'Course details.' })
  @ApiResponse({ status: 404, description: 'Course not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Course ID' })
  @Get(':id')
  async getCourseById(@Param('id') id: string) {
    try {
      const course = await this.academicService.getCourseById(id);

      if (!course) {
        throw new HttpException('Course not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        course,
      };
    } catch (error) {
      this.logger.error(`Error getting course ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Create a new course' })
  @ApiResponse({ status: 201, description: 'Course created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid course data.' })
  @ApiBody({
    schema: {
      example: {
        name: 'Web Development',
        code: 'ISIS3710',
        credits: 3,
        faculty: 'Engineering',
        prerequisites: ['ISIS2603'],
      }
    }
  })
  @Post()
  async createCourse(@Body() courseData: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!courseData.name || !courseData.code) {
        throw new HttpException(
          'Name and code are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const course = await this.academicService.createCourse(courseData);
      return {
        success: true,
        course,
      };
    } catch (error) {
      this.logger.error('Error creating course:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Update course by ID' })
  @ApiResponse({ status: 200, description: 'Course updated successfully.' })
  @ApiResponse({ status: 404, description: 'Course not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Course ID' })
  @ApiBody({
    schema: {
      example: {
        name: 'Web Development',
        code: 'ISIS3710',
        credits: 3,
        faculty: 'Engineering',
        prerequisites: ['ISIS2603'],
      }
    }
  })
  @Put(':id')
  async updateCourse(@Param('id') id: string, @Body() courseData: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const course = await this.academicService.updateCourse(id, courseData);

      if (!course) {
        throw new HttpException('Course not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        course,
      };
    } catch (error) {
      this.logger.error(`Error updating course ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete course by ID' })
  @ApiResponse({ status: 200, description: 'Course deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Course not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Course ID' })
  @Delete(':id')
  async deleteCourse(@Param('id') id: string) {
    try {
      await this.academicService.deleteCourse(id);
      return {
        success: true,
        message: 'Course deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting course ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
