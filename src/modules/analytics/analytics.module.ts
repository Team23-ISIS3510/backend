import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsBookingService } from './analytics-booking.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [FirebaseModule, AvailabilityModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsBookingService],
  exports: [AnalyticsService, AnalyticsBookingService],
})
export class AnalyticsModule {}