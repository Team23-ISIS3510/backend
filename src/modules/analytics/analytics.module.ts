import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsBookingService } from './analytics-booking.service';
import { AnalyticsFeatureCorrelationService } from './analytics-feature-correlation.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AvailabilityModule } from '../availability/availability.module';
import { UserModule } from '../user/user.module';
import { TutoringSessionModule } from '../tutoring-session/tutoring-session.module';
import { AuthModule } from '../auth/auth.module';
import { OccupancyRepository } from './repositories/occupancy.repository';
import { AnalyticsOccupancyUpdateService } from './analytics-occupancy-update.service';
import { TutoringSessionOccupancyUpdateService } from '../tutoring-session/tutoring-session-occupancy-update.service';
import { AvailabilityOccupancyUpdateService } from '../availability/availability-occupancy-update.service';

@Module({
  imports: [FirebaseModule, forwardRef(() => AvailabilityModule), UserModule, forwardRef(() => TutoringSessionModule), AuthModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsBookingService,
    AnalyticsFeatureCorrelationService,
    OccupancyRepository,
    AnalyticsOccupancyUpdateService,
    TutoringSessionOccupancyUpdateService,
    AvailabilityOccupancyUpdateService,
  ],
  exports: [
    AnalyticsService,
    AnalyticsBookingService,
    AnalyticsFeatureCorrelationService,
    OccupancyRepository,
    AnalyticsOccupancyUpdateService,
    TutoringSessionOccupancyUpdateService,
    AvailabilityOccupancyUpdateService,
  ],
})
export class AnalyticsModule {}