import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { HistoryAnalytics } from '../entities/history-analytics.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class HistoryAnalyticsRepository {
  private readonly logger = new Logger(HistoryAnalyticsRepository.name);
  private readonly COLLECTION = 'history_analytics';

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Create a new history analytics event
   */
  async create(event: Omit<HistoryAnalytics, 'id' | 'createdAt'>): Promise<HistoryAnalytics> {
    try {
      const db = this.firebaseService.getFirestore();
      const docRef = await db.collection(this.COLLECTION).add({
        ...event,
        timestamp: admin.firestore.Timestamp.fromDate(event.timestamp),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const doc = await docRef.get();
      const data = doc.data();

      if (!data) {
        throw new Error('Failed to retrieve created document');
      }

      return {
        id: doc.id,
        tutorId: data.tutorId,
        eventType: data.eventType,
        timestamp: data.timestamp.toDate(),
        createdAt: data.createdAt?.toDate(),
        metadata: data.metadata,
      } as HistoryAnalytics;
    } catch (error) {
      this.logger.error(`Error creating history analytics event:`, error);
      throw error;
    }
  }

  /**
   * Find all history analytics events for a specific tutor
   */
  async findByTutor(tutorId: string): Promise<HistoryAnalytics[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        if (!data) return null as any;
        return {
          id: doc.id,
          tutorId: data.tutorId,
          eventType: data.eventType,
          timestamp: data.timestamp?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate(),
          metadata: data.metadata,
        } as HistoryAnalytics;
      }).filter(item => item !== null);
    } catch (error) {
      this.logger.error(`Error finding history analytics events for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Find all history analytics events within a date range
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<HistoryAnalytics[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        if (!data) return null as any;
        return {
          id: doc.id,
          tutorId: data.tutorId,
          eventType: data.eventType,
          timestamp: data.timestamp?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate(),
          metadata: data.metadata,
        } as HistoryAnalytics;
      }).filter(item => item !== null);
    } catch (error) {
      this.logger.error(`Error finding history analytics events by date range:`, error);
      throw error;
    }
  }

  /**
   * Find all history analytics events within a date range for a specific event type
   */
  async findByEventTypeAndDateRange(
    eventType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoryAnalytics[]> {
    try {
      const events = await this.findByDateRange(startDate, endDate);
      return events.filter(event => event.eventType === eventType);
    } catch (error) {
      this.logger.error(
        `Error finding history analytics events by type and date range:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Count total events in a date range
   */
  async countByDateRange(startDate: Date, endDate: Date): Promise<number> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      return snapshot.docs.length;
    } catch (error) {
      this.logger.error(`Error counting history analytics events:`, error);
      throw error;
    }
  }

  /**
   * Get distinct tutors who had events in a date range
   */
  async getDistinctTutorsInDateRange(startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      const tutorIds = new Set<string>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data && data.tutorId) {
          tutorIds.add(data.tutorId);
        }
      });

      return Array.from(tutorIds);
    } catch (error) {
      this.logger.error(`Error getting distinct tutors in date range:`, error);
      throw error;
    }
  }

  /**
   * Delete all events (useful for cleanup in development)
   */
  async deleteAll(): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db.collection(this.COLLECTION).get();

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      this.logger.log('All history analytics events deleted');
    } catch (error) {
      this.logger.error(`Error deleting all history analytics events:`, error);
      throw error;
    }
  }

  /**
   * Delete events in a date range (useful for cleanup)
   */
  async deleteByDateRange(startDate: Date, endDate: Date): Promise<number> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      this.logger.log(
        `Deleted ${snapshot.docs.length} history analytics events in date range`,
      );
      return snapshot.docs.length;
    } catch (error) {
      this.logger.error(`Error deleting history analytics events by date range:`, error);
      throw error;
    }
  }
}
