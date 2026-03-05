import { Controller, Get, Param } from '@nestjs/common';
import { TutorService } from './tutor.service';

@Controller('tutors')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get()
  findAll() {
    return this.tutorService.getAllTutors();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tutorService.getTutorById(id);
  }
}
