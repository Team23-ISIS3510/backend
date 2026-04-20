import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { Occupancy } from '../entities/occupancy.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class OccupancyRepository {
  private readonly logger = new Logger(OccupancyRepository.name);
  private readonly COLLECTION = 'occupancy';

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Find occupancy record by tutor and subject
   */
  async findByTutorAndSubject(tutorId: string, subjectId: string): Promise<Occupancy | null> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('subjectId', '==', subjectId)
        .limit(1)
        .get();

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      } as Occupancy;
    } catch (error) {
      this.logger.error(`Error finding occupancy for ${tutorId}/${subjectId}:`, error);
      throw error;
    }
  }

  /**
   * Find all occupancy records for a tutor
   */
  async findByTutor(tutorId: string): Promise<Occupancy[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Occupancy));
    } catch (error) {
      this.logger.error(`Error finding occupancy for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Save or update occupancy record
   */
  async save(occupancy: Occupancy): Promise<Occupancy> {
    try {
      const db = this.firebaseService.getFirestore();
      const { id, ...data } = occupancy;
      const { tutorId, subjectId } = data;

      // Find existing record
      const existing = await this.findByTutorAndSubject(tutorId, subjectId);

      if (existing?.id) {
        // Update existing record
        const updateData = {
          ...data,
          updatedAt: admin.firestore.Timestamp.now(),
        };

        await db
          .collection(this.COLLECTION)
          .doc(existing.id)
          .update(updateData);

        return { id: existing.id, ...updateData } as any as Occupancy;
      } else {
        // Create new record
        const createData = {
          ...data,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        };

        const docRef = await db
          .collection(this.COLLECTION)
          .add(createData);

        return { id: docRef.id, ...createData } as any as Occupancy;
      }
    } catch (error) {
      this.logger.error(`Error saving occupancy:`, error);
      throw error;
    }
  }

  /**
   * Delete occupancy record
   */
  async delete(tutorId: string, subjectId: string): Promise<void> {
    try {
      const existing = await this.findByTutorAndSubject(tutorId, subjectId);
      if (existing?.id) {
        const db = this.firebaseService.getFirestore();
        await db.collection(this.COLLECTION).doc(existing.id).delete();
      }
    } catch (error) {
      this.logger.error(`Error deleting occupancy for ${tutorId}/${subjectId}:`, error);
      throw error;
    }
  }

  /**
   * Get all occupancy records (for admin/analytics)
   */
  async findAll(): Promise<Occupancy[]> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db.collection(this.COLLECTION).get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Occupancy));
    } catch (error) {
      this.logger.error(`Error finding all occupancy records:`, error);
      throw error;
    }
  }
}
