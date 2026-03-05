import { Module } from '@nestjs/common';
import { TutoringSessionController } from './tutoring-session.controller';
import { TutoringSessionService } from './tutoring-session.service';
import { TutoringSessionRepository } from './tutoring-session.repository';
import { SlotBookingRepository } from './slot-booking.repository';
import { FirebaseModule } from '../firebase/firebase.module';
import { CalicoCalendarModule } from '../calico-calendar/calico-calendar.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [FirebaseModule, CalicoCalendarModule, NotificationModule, UserModule],
  controllers: [TutoringSessionController],
  providers: [TutoringSessionService, TutoringSessionRepository, SlotBookingRepository],
  exports: [TutoringSessionService, SlotBookingRepository],
})
export class TutoringSessionModule {}

