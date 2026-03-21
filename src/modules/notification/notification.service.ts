import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async getNotificationById(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
    return notification;
  }

  async createNotification(
    notificationData: Partial<Notification> | any,
  ): Promise<Notification> {
    // Handle recipientId for backward compatibility
    const recipientId: string =
      notificationData.recipientId || notificationData.userId || '';

    const id = await this.notificationRepository.save(undefined, {
      ...notificationData,
      isRead: false,
      recipientId: recipientId,
    });
    return await this.getNotificationById(id);
  }

  async markAsRead(id: string): Promise<Notification> {
    await this.notificationRepository.save(id, {
      isRead: true,
      readAt: new Date(),
    });
    return await this.getNotificationById(id);
  }

  async getNotificationsByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return await this.notificationRepository.findByUser(userId, limit);
  }

  async getUnreadNotificationsByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return await this.notificationRepository.findUnreadByUser(userId, limit);
  }

  async getAllNotifications(limit: number = 100): Promise<Notification[]> {
    return await this.notificationRepository.findAll(limit);
  }

  async deleteNotification(id: string): Promise<void> {
    await this.notificationRepository.delete(id);
  }
}
