import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TutorService } from './tutor.service';

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
}
