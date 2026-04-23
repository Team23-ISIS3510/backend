import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { TutorService } from './tutor.service';
import { TutorApplicationDto, TutorApplicationResponseDto } from './tutor-application.types';

@ApiTags('Tutors')
@Controller('tutors')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @ApiOperation({
    summary: 'Get all tutors',
    description: 'Returns all users with `isTutor: true`, sorted by rating. Each tutor is enriched with availability stats.',
  })
  @ApiResponse({ status: 200, description: 'List of tutor profiles.' })
  @Get()
  findAll() {
    return this.tutorService.getAllTutors();
  }

  @ApiOperation({
    summary: 'Get tutor by ID',
    description:
      'Looks up a tutor by their Firebase UID (Firestore document ID). ' +
      'Falls back to email lookup if the id contains `@`. ' +
      'Returns the profile enriched with availability stats.',
  })
  @ApiParam({ name: 'id', description: 'Tutor Firebase UID or email address' })
  @ApiResponse({ status: 200, description: 'Tutor profile found.' })
  @ApiResponse({ status: 404, description: 'Tutor not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tutorService.getTutorById(id);
  }

  @ApiOperation({
    summary: 'Get courses for a tutor',
    description: 'Returns the list of courses that the tutor is allowed to teach.',
  })
  @ApiParam({ name: 'tutorId', description: 'Tutor Firebase UID' })
  @ApiResponse({ status: 200, description: 'List of courses.' })
  @ApiResponse({ status: 404, description: 'Tutor not found.' })
  @Get(':tutorId/courses')
  async getTutorCourses(@Param('tutorId') tutorId: string) {
    return this.tutorService.getTutorCourses(tutorId);
  }

  @ApiOperation({
    summary: 'Apply for a course',
    description: 'Allows a tutor to apply for teaching a specific course. Stores application in pending status.',
  })
  @ApiResponse({ status: 201, description: 'Application created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid request or duplicate application.' })
  @ApiResponse({ status: 404, description: 'Tutor or course not found.' })
  @ApiBody({ type: TutorApplicationDto })
  @Post('apply')
  async applyForCourse(
    @Body('tutorId') tutorId: string,
    @Body('courseId') courseId: string,
    @Body('notes') notes?: string,
  ) {
    return this.tutorService.createCourseApplication(tutorId, courseId, notes);
  }

  @ApiOperation({
    summary: 'Get my applications',
    description: 'Get all applications (pending, approved, rejected) for the authenticated tutor.',
  })
  @ApiParam({ name: 'tutorId', description: 'Tutor Firebase UID' })
  @ApiResponse({ status: 200, description: 'List of applications.' })
  @Get(':tutorId/applications')
  async getMyApplications(@Param('tutorId') tutorId: string) {
    return this.tutorService.getTutorApplications(tutorId);
  }

  @ApiOperation({
    summary: 'Get all pending applications (admin only)',
    description: 'Returns all pending course applications across all tutors.',
  })
  @ApiResponse({ status: 200, description: 'List of pending applications.' })
  @Get('admin/pending-applications')
  async getPendingApplications() {
    return this.tutorService.getPendingApplications();
  }

  @ApiOperation({
    summary: 'Approve application (admin only)',
    description:
      'Approve a course application and automatically add the course to the tutor\'s courses.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Application approved and course added to tutor.' })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  @Post('admin/applications/:applicationId/approve')
  async approveApplication(
    @Param('applicationId') applicationId: string,
    @Body('reviewedBy') reviewedBy: string,
  ) {
    return this.tutorService.approveApplication(applicationId, reviewedBy);
  }

  @ApiOperation({
    summary: 'Reject application (admin only)',
    description: 'Reject a course application with optional reason.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application ID' })
  @ApiResponse({ status: 200, description: 'Application rejected.' })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  @Post('admin/applications/:applicationId/reject')
  async rejectApplication(
    @Param('applicationId') applicationId: string,
    @Body('rejectionReason') rejectionReason: string,
    @Body('reviewedBy') reviewedBy: string,
  ) {
    return this.tutorService.rejectApplication(
      applicationId,
      rejectionReason,
      reviewedBy,
    );
  }
}
