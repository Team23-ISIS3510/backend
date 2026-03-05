import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { Notification } from './entities/notification.entity';

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

  constructor(private readonly repository: NotificationRepository) {}

  async createNotification(dto: CreateNotificationDto): Promise<void> {
    this.logger.log(`Notification [${dto.type}] → ${dto.recipientId}: ${dto.title}`);
    await this.repository.save(undefined, {
      ...dto,
      isRead: false,
    });
  }

  async getAllNotifications(limit: number = 100): Promise<Notification[]> {
    return this.repository.findAll(limit);
  }

  async getNotificationById(id: string): Promise<Notification | null> {
    return this.repository.findById(id);
  }

  async getNotificationsByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return this.repository.findByUser(userId, limit);
  }

  async getUnreadNotificationsByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return this.repository.findUnreadByUser(userId, limit);
  }

  async markAsRead(id: string): Promise<Notification | null> {
    const notification = await this.repository.findById(id);
    if (!notification) {
      return null;
    }
    await this.repository.save(id, {
      isRead: true,
      readAt: new Date(),
    });
    return this.repository.findById(id);
  }

  async deleteNotification(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
