import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

export interface SlotBooking {
  id?: string;
  parentAvailabilityId: string;
  slotIndex: number;
  slotId?: string;
  tutorEmail?: string;
  studentEmail?: string;
  sessionId: string;
  slotStartTime: Date;
  slotEndTime: Date;
  course?: string;
  bookedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class SlotBookingRepository {
  private readonly logger = new Logger(SlotBookingRepository.name);
  private readonly COLLECTION = 'slot_bookings';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findById(id: string): Promise<SlotBooking | null> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        parentAvailabilityId: data.parentAvailabilityId,
        slotIndex: data.slotIndex,
        slotId: data.slotId,
        tutorEmail: data.tutorEmail,
        studentEmail: data.studentEmail,
        sessionId: data.sessionId,
        slotStartTime: data.slotStartTime?.toDate(),
        slotEndTime: data.slotEndTime?.toDate(),
        course: data.course,
        bookedAt: data.bookedAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as SlotBooking;
    } catch (error) {
      this.logger.error('Error finding slot booking by ID:', error);
      throw error;
    }
  }

  async findByParentAndIndex(
    parentAvailabilityId: string,
    slotIndex: number,
  ): Promise<SlotBooking | null> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('parentAvailabilityId', '==', parentAvailabilityId)
        .where('slotIndex', '==', slotIndex)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        parentAvailabilityId: data.parentAvailabilityId,
        slotIndex: data.slotIndex,
        slotId: data.slotId,
        tutorEmail: data.tutorEmail,
        studentEmail: data.studentEmail,
        sessionId: data.sessionId,
        slotStartTime: data.slotStartTime?.toDate(),
        slotEndTime: data.slotEndTime?.toDate(),
        course: data.course,
        bookedAt: data.bookedAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as SlotBooking;
    } catch (error) {
      this.logger.error('Error finding slot booking by parent and index:', error);
      throw error;
    }
  }

  async findByAvailability(parentAvailabilityId: string): Promise<SlotBooking[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('parentAvailabilityId', '==', parentAvailabilityId)
        .get();

      const bookings: SlotBooking[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          parentAvailabilityId: data.parentAvailabilityId,
          slotIndex: data.slotIndex,
          slotId: data.slotId,
          tutorEmail: data.tutorEmail,
          studentEmail: data.studentEmail,
          sessionId: data.sessionId,
          slotStartTime: data.slotStartTime?.toDate(),
          slotEndTime: data.slotEndTime?.toDate(),
          course: data.course,
          bookedAt: data.bookedAt?.toDate(),
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as SlotBooking);
      });

      return bookings;
    } catch (error) {
      this.logger.error('Error finding slot bookings by availability:', error);
      throw error;
    }
  }

  async findByTutor(tutorEmail: string, limit: number = 100): Promise<SlotBooking[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('tutorEmail', '==', tutorEmail)
        .orderBy('slotStartTime', 'desc')
        .limit(limit)
        .get();

      const bookings: SlotBooking[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          parentAvailabilityId: data.parentAvailabilityId,
          slotIndex: data.slotIndex,
          slotId: data.slotId,
          tutorEmail: data.tutorEmail,
          studentEmail: data.studentEmail,
          sessionId: data.sessionId,
          slotStartTime: data.slotStartTime?.toDate(),
          slotEndTime: data.slotEndTime?.toDate(),
          course: data.course,
          bookedAt: data.bookedAt?.toDate(),
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as SlotBooking);
      });

      return bookings;
    } catch (error) {
      this.logger.error('Error finding slot bookings by tutor:', error);
      throw error;
    }
  }

  async findBySession(sessionId: string): Promise<SlotBooking[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('sessionId', '==', sessionId)
        .get();

      const bookings: SlotBooking[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          parentAvailabilityId: data.parentAvailabilityId,
          slotIndex: data.slotIndex,
          slotId: data.slotId,
          tutorEmail: data.tutorEmail,
          studentEmail: data.studentEmail,
          sessionId: data.sessionId,
          slotStartTime: data.slotStartTime?.toDate(),
          slotEndTime: data.slotEndTime?.toDate(),
          course: data.course,
          bookedAt: data.bookedAt?.toDate(),
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as SlotBooking);
      });

      return bookings;
    } catch (error) {
      this.logger.error('Error finding slot bookings by session:', error);
      throw error;
    }
  }

  async save(id: string | undefined, bookingData: Partial<SlotBooking>): Promise<string> {
    try {
      const firestoreData: any = {
        ...bookingData,
        updatedAt: this.firebaseService.getTimestamp(),
      };

      // Convert dates to Firestore timestamps
      if (bookingData.slotStartTime) {
        firestoreData.slotStartTime = admin.firestore.Timestamp.fromDate(
          bookingData.slotStartTime instanceof Date
            ? bookingData.slotStartTime
            : new Date(bookingData.slotStartTime),
        );
      }
      if (bookingData.slotEndTime) {
        firestoreData.slotEndTime = admin.firestore.Timestamp.fromDate(
          bookingData.slotEndTime instanceof Date
            ? bookingData.slotEndTime
            : new Date(bookingData.slotEndTime),
        );
      }
      if (bookingData.bookedAt) {
        firestoreData.bookedAt = admin.firestore.Timestamp.fromDate(
          bookingData.bookedAt instanceof Date
            ? bookingData.bookedAt
            : new Date(bookingData.bookedAt),
        );
      }

      if (id) {
        const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          firestoreData.createdAt = this.firebaseService.getTimestamp();
        }
        await docRef.set(firestoreData, { merge: true });
        return id;
      } else {
        const colRef = this.firebaseService.getFirestore().collection(this.COLLECTION);
        firestoreData.createdAt = this.firebaseService.getTimestamp();
        if (!firestoreData.bookedAt) {
          firestoreData.bookedAt = this.firebaseService.getTimestamp();
        }
        const docRef = await colRef.add(firestoreData);
        return docRef.id;
      }
    } catch (error) {
      this.logger.error('Error saving slot booking:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(id);
      await docRef.delete();
    } catch (error) {
      this.logger.error('Error deleting slot booking:', error);
      throw error;
    }
  }

  async deleteBySession(sessionId: string): Promise<void> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('sessionId', '==', sessionId)
        .get();

      const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
    } catch (error) {
      this.logger.error('Error deleting slot bookings by session:', error);
      throw error;
    }
  }

  async deleteByParentAndIndex(
    parentAvailabilityId: string,
    slotIndex: number,
    sessionId?: string,
  ): Promise<void> {
    try {
      let query = this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('parentAvailabilityId', '==', parentAvailabilityId)
        .where('slotIndex', '==', slotIndex);

      if (sessionId) {
        query = query.where('sessionId', '==', sessionId) as any;
      }

      const snapshot = await query.get();

      const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
    } catch (error) {
      this.logger.error('Error deleting slot bookings by parent and index:', error);
      throw error;
    }
  }
}

