import { Module, forwardRef } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityRepository } from './availability.repository';
import { SlotService } from './slot.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TutoringSessionModule } from '../tutoring-session/tutoring-session.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [FirebaseModule, CalendarModule, TutoringSessionModule, forwardRef(() => AnalyticsModule)],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityRepository, SlotService],
  exports: [AvailabilityService, AvailabilityRepository, SlotService],
})
export class AvailabilityModule {}
