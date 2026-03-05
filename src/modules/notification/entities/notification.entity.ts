export interface Notification {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  courseId?: string;
  isRead: boolean;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: Date;
  readAt?: Date;
}
