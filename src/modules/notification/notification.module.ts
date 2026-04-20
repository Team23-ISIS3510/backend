import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { FirebaseModule } from '../firebase/firebase.module';
import { BrevoEmailService } from './brevo-email.service';

@Module({
  imports: [FirebaseModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, BrevoEmailService],
  exports: [NotificationService],
})
export class NotificationModule {}
