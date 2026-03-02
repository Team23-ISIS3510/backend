import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Availability } from './entities/availability.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class AvailabilityRepository {
  private readonly logger = new Logger(AvailabilityRepository.name);
  private readonly COLLECTION = 'availabilities';

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Safely convert a Firestore Timestamp, Date, string, or other value to a Date object
   */
  private safeToDate(value: any): Date | undefined {
    if (!value) return undefined;

    // If it's already a Date, return it
    if (value instanceof Date) return value;

    // If it's a Firestore Timestamp, use toDate()
    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (error) {
        this.logger.warn('Error converting Timestamp to Date:', error);
        return undefined;
      }
    }

    // If it's a string, try to parse it
    if (typeof value === 'string') {
      try {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      } catch (error) {
        this.logger.warn('Error parsing date string:', error);
      }
    }

    // If it's a number (timestamp), convert it
    if (typeof value === 'number') {
      try {
        return new Date(value);
      } catch (error) {
        this.logger.warn('Error converting number to Date:', error);
      }
    }

    return undefined;
  }

  async findById(googleEventId: string): Promise<Availability | null> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(googleEventId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        tutorId: data?.tutorId,
        title: data?.title,
        location: data?.location,
        startDateTime: this.safeToDate(data?.startDateTime),
        endDateTime: this.safeToDate(data?.endDateTime),
        googleEventId: data?.googleEventId,
        eventLink: data?.eventLink || data?.htmlLink || null,
        recurring: data?.recurring,
        recurrenceRule: data?.recurrenceRule,
        sourceCalendarId: data?.sourceCalendarId,
        sourceCalendarName: data?.sourceCalendarName,
        course: data?.course,
        createdAt: this.safeToDate(data?.createdAt),
        updatedAt: this.safeToDate(data?.updatedAt),
      } as Availability;
    } catch (error) {
      this.logger.error('Error finding by ID:', error);
      throw error;
    }
  }

  /**
   * Remove undefined values from object (Firestore doesn't accept undefined)
   */
  private removeUndefinedValues(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !(obj[key] instanceof Date) && !(obj[key] instanceof admin.firestore.Timestamp)) {
          cleaned[key] = this.removeUndefinedValues(obj[key]);
        } else {
          cleaned[key] = obj[key];
        }
      }
    }
    return cleaned;
  }

  async save(googleEventId: string | undefined, availabilityData: Partial<Availability>): Promise<string> {
    try {
      const firestoreData: any = {
        ...availabilityData,
        googleEventId: googleEventId,
        eventLink: availabilityData['eventLink'] || availabilityData['htmlLink'] || null,
        updatedAt: this.firebaseService.getTimestamp(),
      };

      // Remove undefined values (Firestore doesn't accept undefined)
      const cleanedData = this.removeUndefinedValues(firestoreData);

      if (googleEventId) {
        const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(googleEventId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          cleanedData.createdAt = this.firebaseService.getTimestamp();
        }
        await docRef.set(cleanedData, { merge: true });
        return googleEventId;
      } else {
        const colRef = this.firebaseService.getFirestore().collection(this.COLLECTION);
        cleanedData.createdAt = this.firebaseService.getTimestamp();
        const docRef = await colRef.add(cleanedData);
        return docRef.id;
      }
    } catch (error) {
      this.logger.error('Error saving:', error);
      throw error;
    }
  }

  async delete(googleEventId: string): Promise<void> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(googleEventId);
      await docRef.delete();
    } catch (error) {
      this.logger.error('Error deleting:', error);
      throw error;
    }
  }

  async exists(googleEventId: string): Promise<boolean> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(googleEventId);
      const docSnap = await docRef.get();
      return docSnap.exists;
    } catch (error) {
      this.logger.error('Error checking existence:', error);
      throw error;
    }
  }

  async findByTutor(tutorId: string, limitCount: number = 50): Promise<Availability[]> {
    try {
      const results: Availability[] = [];
      const seen = new Set<string>();

      const addFromSnapshot = (snapshot: admin.firestore.QuerySnapshot) => {
        snapshot.forEach((docSnap) => {
          if (seen.has(docSnap.id)) return;
          seen.add(docSnap.id);

          const data = docSnap.data();
          results.push({
            id: docSnap.id,
            tutorId: data.tutorId,
            title: data.title,
            location: data.location,
            startDateTime: this.safeToDate(data.startDateTime),
            endDateTime: this.safeToDate(data.endDateTime),
            googleEventId: data.googleEventId,
            eventLink: data.eventLink || data.htmlLink || null,
            recurring: data.recurring,
            recurrenceRule: data.recurrenceRule,
            sourceCalendarId: data.sourceCalendarId,
            sourceCalendarName: data.sourceCalendarName,
            course: data.course,
            createdAt: this.safeToDate(data.createdAt),
            updatedAt: this.safeToDate(data.updatedAt),
          } as Availability);
        });
      };

      const db = this.firebaseService.getFirestore();

      // Query by tutorId and order by startDateTime
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .orderBy('startDateTime', 'asc')
        .limit(limitCount)
        .get();
      addFromSnapshot(snapshot);

      // Sort by start date (safely handle undefined)
      results.sort((a, b) => {
        const tA = a.startDateTime ? a.startDateTime.getTime() : 0;
        const tB = b.startDateTime ? b.startDateTime.getTime() : 0;
        return tA - tB;
      });

      return results;
    } catch (error) {
      this.logger.error('Error finding by tutor:', error);
      throw error;
    }
  }

  async findByCourse(course: string, limitCount: number = 50): Promise<Availability[]> {
    try {
      const availabilities: Availability[] = [];
      const processedIds = new Set<string>();
      const db = this.firebaseService.getFirestore();

      const addFromSnapshot = (snapshot: admin.firestore.QuerySnapshot) => {
        snapshot.forEach((doc) => {
          if (!processedIds.has(doc.id)) {
            processedIds.add(doc.id);
            const data = doc.data();
            availabilities.push({
              id: doc.id,
              tutorId: data.tutorId,
              title: data.title,
              location: data.location,
              startDateTime: this.safeToDate(data.startDateTime),
              endDateTime: this.safeToDate(data.endDateTime),
              googleEventId: data.googleEventId,
              eventLink: data.eventLink || data.htmlLink || null,
              recurring: data.recurring,
              recurrenceRule: data.recurrenceRule,
              sourceCalendarId: data.sourceCalendarId,
              sourceCalendarName: data.sourceCalendarName,
              course: data.course,
              createdAt: this.safeToDate(data.createdAt),
              updatedAt: this.safeToDate(data.updatedAt),
            } as Availability);
          }
        });
      };

      // Search entries with matching course field
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('course', '==', course)
        .orderBy('startDateTime', 'asc')
        .limit(limitCount)
        .get();
      addFromSnapshot(snapshot);

      // Sort by start date (safely handle undefined)
      availabilities.sort((a, b) => {
        const tA = a.startDateTime ? a.startDateTime.getTime() : 0;
        const tB = b.startDateTime ? b.startDateTime.getTime() : 0;
        return tA - tB;
      });

      return availabilities;
    } catch (error) {
      this.logger.error('Error finding by course:', error);
      throw error;
    }
  }

  async findInDateRange(
    startDate: Date,
    endDate: Date,
    limitCount: number = 100,
  ): Promise<Availability[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
      const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);

      const snapshot = await db
        .collection(this.COLLECTION)
        .where('startDateTime', '>=', startTimestamp)
        .where('startDateTime', '<=', endTimestamp)
        .orderBy('startDateTime', 'asc')
        .limit(limitCount)
        .get();

      const availabilities: Availability[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        availabilities.push({
          id: doc.id,
          tutorId: data.tutorId,
          title: data.title,
          location: data.location,
          startDateTime: this.safeToDate(data.startDateTime),
          endDateTime: this.safeToDate(data.endDateTime),
          googleEventId: data.googleEventId,
          eventLink: data.eventLink || data.htmlLink || null,
          recurring: data.recurring,
          recurrenceRule: data.recurrenceRule,
          sourceCalendarId: data.sourceCalendarId,
          sourceCalendarName: data.sourceCalendarName,
          course: data.course,
          createdAt: this.safeToDate(data.createdAt),
          updatedAt: this.safeToDate(data.updatedAt),
        } as Availability);
      });

      return availabilities;
    } catch (error) {
      this.logger.error('Error finding in date range:', error);
      throw error;
    }
  }

  async findByTutorAndDateRange(
    tutorId: string,
    startDate: Date,
    endDate: Date,
    limitCount: number = 100,
  ): Promise<Availability[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
      const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);

      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('startDateTime', '>=', startTimestamp)
        .where('startDateTime', '<=', endTimestamp)
        .orderBy('startDateTime', 'asc')
        .limit(limitCount)
        .get();

      const availabilities: Availability[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        availabilities.push({
          id: doc.id,
          tutorId: data.tutorId,
          title: data.title,
          location: data.location,
          startDateTime: this.safeToDate(data.startDateTime),
          endDateTime: this.safeToDate(data.endDateTime),
          googleEventId: data.googleEventId,
          eventLink: data.eventLink || data.htmlLink || null,
          recurring: data.recurring,
          recurrenceRule: data.recurrenceRule,
          sourceCalendarId: data.sourceCalendarId,
          sourceCalendarName: data.sourceCalendarName,
          course: data.course,
          createdAt: this.safeToDate(data.createdAt),
          updatedAt: this.safeToDate(data.updatedAt),
        } as Availability);
      });

      return availabilities;
    } catch (error) {
      this.logger.error('Error finding by tutor and date range:', error);
      throw error;
    }
  }

  async findByIds(ids: string[]): Promise<Availability[]> {
    try {
      if (!ids || ids.length === 0) {
        return [];
      }

      const db = this.firebaseService.getFirestore();
      const CHUNK_SIZE = 10; // Firestore "in" queries support up to 10 values
      const availabilities: Availability[] = [];
      const processedIds = new Set<string>();

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);

        const snapshot = await db
          .collection(this.COLLECTION)
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();

        snapshot.forEach((doc) => {
          if (processedIds.has(doc.id)) {
            return;
          }
          processedIds.add(doc.id);

          const data = doc.data();
          availabilities.push({
            id: doc.id,
            tutorId: data.tutorId,
            title: data.title,
            location: data.location,
            startDateTime: this.safeToDate(data.startDateTime),
            endDateTime: this.safeToDate(data.endDateTime),
            googleEventId: data.googleEventId,
            eventLink: data.eventLink || data.htmlLink || null,
            recurring: data.recurring,
            recurrenceRule: data.recurrenceRule,
            sourceCalendarId: data.sourceCalendarId,
            sourceCalendarName: data.sourceCalendarName,
            course: data.course,
            createdAt: this.safeToDate(data.createdAt),
            updatedAt: this.safeToDate(data.updatedAt),
          } as Availability);
        });
      }

      return availabilities;
    } catch (error) {
      this.logger.error('Error finding by IDs:', error);
      throw error;
    }
  }
}
