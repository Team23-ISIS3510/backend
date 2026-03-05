import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { MajorsController } from './majors.controller';
import { AcademicService } from './academic.service';
import { AcademicRepository } from './academic.repository';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [CoursesController, MajorsController],
  providers: [AcademicService, AcademicRepository],
  exports: [AcademicService],
})
export class AcademicModule {}
