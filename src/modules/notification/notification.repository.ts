import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Notification } from './entities/notification.entity';
import * as admin from 'firebase-admin';

interface FirestoreNotificationData {
  recipientId?: string;
  userId?: string;
  type?: string;
  title?: string;
  message?: string;
  courseId?: string;
  isRead?: boolean;
  read?: boolean;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt?: admin.firestore.Timestamp;
  readAt?: admin.firestore.Timestamp;
}

@Injectable()
export class NotificationRepository {
  private readonly logger = new Logger(NotificationRepository.name);
  private readonly COLLECTION = 'notifications';

  constructor(private readonly firebaseService: FirebaseService) {}

  private convertToNotification(
    docId: string,
    data: FirestoreNotificationData | undefined,
  ): Notification {
    if (!data) {
      throw new Error('Document data is null or undefined');
    }
    return {
      id: docId,
      recipientId: data.recipientId || data.userId || '',
      type: data.type || '',
      title: data.title || '',
      message: data.message || '',
      courseId: data.courseId,
      isRead: data.isRead !== undefined ? data.isRead : (data.read ?? false),
      relatedEntityId: data.relatedEntityId,
      relatedEntityType: data.relatedEntityType,
      createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
      readAt: data.readAt ? data.readAt.toDate() : undefined,
    } as Notification;
  }

  async findById(id: string): Promise<Notification | null> {
    try {
      const docRef = this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      return this.convertToNotification(docSnap.id, data);
    } catch (error) {
      this.logger.error('Error finding notification by ID:', error);
      throw error;
    }
  }

  async save(
    id: string | undefined,
    notificationData: Partial<Notification> & {
      recipientId?: string;
      userId?: string;
      read?: boolean;
    },
  ): Promise<string> {
    try {
      const firestoreData: Record<string, any> = {};

      // Only set recipientId if provided to avoid Firestore rejecting undefined values
      const recipient =
        notificationData.recipientId ?? notificationData.userId;
      if (recipient !== undefined && recipient !== null) {
        firestoreData.recipientId = recipient;
      }

      // Copy other fields, excluding undefined values
      if (notificationData.type !== undefined)
        firestoreData.type = notificationData.type;
      if (notificationData.title !== undefined)
        firestoreData.title = notificationData.title;
      if (notificationData.message !== undefined)
        firestoreData.message = notificationData.message;
      if (notificationData.courseId !== undefined)
        firestoreData.courseId = notificationData.courseId;
      if (notificationData.relatedEntityId !== undefined)
        firestoreData.relatedEntityId = notificationData.relatedEntityId;
      if (notificationData.relatedEntityType !== undefined)
        firestoreData.relatedEntityType = notificationData.relatedEntityType;
      if (notificationData.readAt !== undefined)
        firestoreData.readAt = notificationData.readAt;

      // Normalize isRead/read to isRead only if present
      if (notificationData.isRead !== undefined) {
        firestoreData.isRead = notificationData.isRead;
      } else if (notificationData.read !== undefined) {
        firestoreData.isRead = notificationData.read;
      }

      firestoreData.updatedAt = this.firebaseService.getTimestamp();

      if (id) {
        // Update existing document
        const docRef = this.firebaseService
          .getFirestore()
          .collection(this.COLLECTION)
          .doc(id);

        try {
          const docSnap = await docRef.get();
          if (!docSnap.exists) {
            firestoreData.createdAt = this.firebaseService.getTimestamp();
          }
        } catch (error) {
          // If get fails, assume new document
          firestoreData.createdAt = this.firebaseService.getTimestamp();
        }

        await docRef.set(firestoreData, { merge: true });
        return id;
      } else {
        // Create new document
        const colRef = this.firebaseService
          .getFirestore()
          .collection(this.COLLECTION);
        firestoreData.createdAt = this.firebaseService.getTimestamp();

        const docRef = await colRef.add(firestoreData);
        this.logger.log(`Created notification with ID: ${docRef.id}`);
        return docRef.id;
      }
    } catch (error: any) {
      this.logger.error('Error saving notification:', error);
      this.logger.error('Error details:', error.message || error);
      throw error;
    }
  }

  async findByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('recipientId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push(this.convertToNotification(doc.id, data));
      });

      return notifications;
    } catch (error) {
      this.logger.error('Error finding notifications by user:', error);
      throw error;
    }
  }

  async findUnreadByUser(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('recipientId', '==', userId)
        .where('isRead', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push(this.convertToNotification(doc.id, data));
      });

      return notifications;
    } catch (error) {
      this.logger.error('Error finding unread notifications by user:', error);
      throw error;
    }
  }

  async findAll(limit: number = 100): Promise<Notification[]> {
    try {
      let snapshot;
      try {
        snapshot = await this.firebaseService
          .getFirestore()
          .collection(this.COLLECTION)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
      } catch (orderError: any) {
        // If orderBy fails (missing index or empty collection), try without ordering
        this.logger.warn(
          'OrderBy failed, fetching without ordering:',
          orderError.message,
        );
        snapshot = await this.firebaseService
          .getFirestore()
          .collection(this.COLLECTION)
          .limit(limit)
          .get();
      }

      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push(this.convertToNotification(doc.id, data));
      });

      return notifications;
    } catch (error) {
      this.logger.error('Error finding all notifications:', error);
      // Return empty array instead of throwing error
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const docRef = this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .doc(id);
      await docRef.delete();
    } catch (error) {
      this.logger.error('Error deleting notification:', error);
      throw error;
    }
  }
}
