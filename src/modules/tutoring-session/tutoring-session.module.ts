import { Module, forwardRef } from '@nestjs/common';
import { TutoringSessionController } from './tutoring-session.controller';
import { TutoringSessionService } from './tutoring-session.service';
import { TutoringSessionRepository } from './tutoring-session.repository';
import { SlotBookingRepository } from './slot-booking.repository';
import { FirebaseModule } from '../firebase/firebase.module';
import { CalicoCalendarModule } from '../calico-calendar/calico-calendar.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [FirebaseModule, CalicoCalendarModule, NotificationModule, UserModule, forwardRef(() => AnalyticsModule)],
  controllers: [TutoringSessionController],
  providers: [TutoringSessionService, TutoringSessionRepository, SlotBookingRepository],
  exports: [TutoringSessionService, TutoringSessionRepository, SlotBookingRepository],
})
export class TutoringSessionModule {}

