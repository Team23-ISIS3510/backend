import { Module } from '@nestjs/common';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AvailabilityModule } from '../availability/availability.module';
import { AcademicModule } from '../academic/academic.module';
import { TutoringSessionModule } from '../tutoring-session/tutoring-session.module';

@Module({
  imports: [FirebaseModule, AvailabilityModule, AcademicModule, TutoringSessionModule],
  controllers: [TutorController],
  providers: [TutorService],
  exports: [TutorService],
})
export class TutorModule {}

