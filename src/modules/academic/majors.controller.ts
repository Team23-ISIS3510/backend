import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AcademicService } from './academic.service';

@ApiTags('Majors')
@Controller('majors')
export class MajorsController {
  private readonly logger = new Logger(MajorsController.name);

  constructor(private readonly academicService: AcademicService) {}

  @ApiOperation({ summary: 'Get all majors' })
  @ApiResponse({ status: 200, description: 'List of majors.' })
  @Get()
  async getAllMajors() {
    try {
      const majors = await this.academicService.getAllMajors();
      return {
        success: true,
        majors,
        count: majors.length,
      };
    } catch (error) {
      this.logger.error('Error getting majors:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get major by ID' })
  @ApiResponse({ status: 200, description: 'Major details.' })
  @ApiResponse({ status: 404, description: 'Major not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Major ID' })
  @Get(':id')
  async getMajorById(@Param('id') id: string) {
    try {
      const major = await this.academicService.getMajorById(id);

      if (!major) {
        throw new HttpException('Major not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        major,
      };
    } catch (error) {
      this.logger.error(`Error getting major ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Create a new major' })
  @ApiResponse({ status: 201, description: 'Major created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid major data.' })
  @ApiBody({
    schema: {
      example: {
        name: 'Computer Science',
        code: 'ISIS',
        faculty: 'Engineering',
      }
    }
  })
  @Post()
  async createMajor(@Body() majorData: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!majorData.name || !majorData.code) {
        throw new HttpException(
          'Name and code are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const major = await this.academicService.createMajor(majorData);
      return {
        success: true,
        major,
      };
    } catch (error) {
      this.logger.error('Error creating major:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Update major by ID' })
  @ApiResponse({ status: 200, description: 'Major updated successfully.' })
  @ApiResponse({ status: 404, description: 'Major not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Major ID' })
  @ApiBody({
    schema: {
      example: {
        name: 'Computer Science',
        code: 'ISIS',
        faculty: 'Engineering',
      }
    }
  })
  @Put(':id')
  async updateMajor(@Param('id') id: string, @Body() majorData: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const major = await this.academicService.updateMajor(id, majorData);

      if (!major) {
        throw new HttpException('Major not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        major,
      };
    } catch (error) {
      this.logger.error(`Error updating major ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete major by ID' })
  @ApiResponse({ status: 200, description: 'Major deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Major not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Major ID' })
  @Delete(':id')
  async deleteMajor(@Param('id') id: string) {
    try {
      await this.academicService.deleteMajor(id);
      return {
        success: true,
        message: 'Major deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting major ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
