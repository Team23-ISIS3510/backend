import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { AcademicModule } from './modules/academic/academic.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { TutoringSessionModule } from './modules/tutoring-session/tutoring-session.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CalicoCalendarModule } from './modules/calico-calendar/calico-calendar.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirebaseModule,
    SubjectsModule,
    AuthModule,
    UserModule,
    AcademicModule,
    TutorModule,
    AvailabilityModule,
    TutoringSessionModule,
    CalendarModule,
    CalicoCalendarModule,
    PaymentModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
