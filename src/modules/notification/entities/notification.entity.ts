export interface Notification {
  id?: string;
  recipientId: string; // reference to users (id)
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  // Optional reference to a course (Firestore `course` collection id)
  courseId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: Date;
  readAt?: Date;
}
