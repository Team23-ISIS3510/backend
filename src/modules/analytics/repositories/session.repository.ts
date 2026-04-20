import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { TutoringSession } from '../../tutoring-session/entities/tutoring-session.entity';

@Injectable()
export class SessionRepository {
  private readonly logger = new Logger(SessionRepository.name);
  private readonly COLLECTION = 'tutoringSessions';

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Get all sessions for a tutor in the last 2 years
   */
  async getTutorSessionsLast2Years(tutorId: string): Promise<TutoringSession[]> {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('createdAt', '>=', twoYearsAgo)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as TutoringSession
      }));
    } catch (error) {
      this.logger.error(`Error fetching sessions for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Get all sessions for a tutor-subject combination in the last 2 years
   */
  async getTutorSubjectSessionsLast2Years(
    tutorId: string,
    subjectId: string,
  ): Promise<TutoringSession[]> {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const db = this.firebaseService.getFirestore();
      const snapshot = await db
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('subjectId', '==', subjectId)
        .where('createdAt', '>=', twoYearsAgo)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as TutoringSession
      }));
    } catch (error) {
      this.logger.error(
        `Error fetching sessions for tutor ${tutorId}, subject ${subjectId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async create(session: Partial<TutoringSession>): Promise<TutoringSession> {
    try {
      const db = this.firebaseService.getFirestore();
      const docRef = db.collection(this.COLLECTION).doc();
      
      const now = new Date();
      const sessionData = {
        ...session,
        createdAt: now,
        updatedAt: now,
      };

      await docRef.set(sessionData);

      return {
        id: docRef.id,
        ...sessionData as TutoringSession
      };
    } catch (error) {
      this.logger.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Update an existing session
   */
  async update(sessionId: string, session: Partial<TutoringSession>): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      await db.collection(this.COLLECTION).doc(sessionId).update({
        ...session,
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error updating session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async findById(sessionId: string): Promise<TutoringSession | null> {
    try {
      const db = this.firebaseService.getFirestore();
      const doc = await db.collection(this.COLLECTION).doc(sessionId).get();

      if (!doc.exists) return null;

      return {
        id: doc.id,
        ...doc.data() as TutoringSession
      };
    } catch (error) {
      this.logger.error(`Error fetching session ${sessionId}:`, error);
      throw error;
    }
  }
}
