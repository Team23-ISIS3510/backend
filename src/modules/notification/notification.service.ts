import { Injectable, Logger } from '@nestjs/common';

export interface CreateNotificationDto {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async createNotification(dto: CreateNotificationDto): Promise<void> {
    this.logger.log(`Notification [${dto.type}] → ${dto.recipientId}: ${dto.title}`);
  }
}
