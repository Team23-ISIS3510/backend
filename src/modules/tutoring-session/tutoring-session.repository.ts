import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { TutoringSession } from './entities/tutoring-session.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class TutoringSessionRepository {
  private readonly logger = new Logger(TutoringSessionRepository.name);
  private readonly COLLECTION = 'tutoring_sessions';
  // Standard collection name per project conventions
  // should be `tutoring_sessions`
  private readonly STANDARD_COLLECTION = 'tutoring_sessions';

  constructor(private readonly firebaseService: FirebaseService) {}

  async addOrUpdateReview(
    sessionId: string,
    review: {
      reviewerEmail: string;
      reviewerName?: string;
      stars: number;
      comment?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): Promise<{ reviews: any[]; averageRating: number }> {
    const db = this.firebaseService.getFirestore();
    const docRef = db.collection(this.STANDARD_COLLECTION).doc(sessionId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        throw new Error('Session not found');
      }

      const data = snap.data() || {};
      const existingReviews: any[] = Array.isArray(data.reviews) ? [...data.reviews] : [];

      const normalizedEmail = review.reviewerEmail.toLowerCase();
      const timestamp = this.firebaseService.getTimestamp();

      const cleanedReview = {
        reviewerEmail: review.reviewerEmail,
        reviewerName: review.reviewerName || review.reviewerEmail,
        stars: Math.max(1, Math.min(5, review.stars || 0)),
        comment: review.comment || '',
        createdAt: review.createdAt ? admin.firestore.Timestamp.fromDate(review.createdAt) : timestamp,
        updatedAt: admin.firestore.Timestamp.fromDate(review.updatedAt || new Date()),
      };

      // Replace existing review from same reviewer or push new
      const existingIndex = existingReviews.findIndex(
        (r: any) => (r.reviewerEmail || '').toLowerCase() === normalizedEmail,
      );
      if (existingIndex >= 0) {
        existingReviews[existingIndex] = {
          ...existingReviews[existingIndex],
          ...cleanedReview,
        };
      } else {
        existingReviews.push(cleanedReview);
      }

      const averageRating =
        existingReviews.length > 0
          ? existingReviews.reduce((sum, r: any) => sum + (Number(r.stars) || 0), 0) / existingReviews.length
          : 0;

      tx.update(docRef, {
        reviews: existingReviews,
        rating: averageRating,
        averageRating,
        updatedAt: timestamp,
      });
    });

    // Return the updated values
    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data() || {};
    const reviews = Array.isArray(updatedData.reviews) ? updatedData.reviews : [];
    const averageRating = updatedData.averageRating || updatedData.rating || 0;
    return { reviews, averageRating };
  }

  async findById(id: string): Promise<TutoringSession | null> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.STANDARD_COLLECTION).doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      return this.mapDocToSession(docSnap.id, data);
    } catch (error) {
      this.logger.error('Error finding session by ID:', error);
      throw error;
    }
  }

  async save(id: string | undefined, sessionData: Partial<TutoringSession>): Promise<string> {
    try {
      const firestoreData: any = {
        ...sessionData,
        updatedAt: this.firebaseService.getTimestamp(),
      };

      // Convert Date objects to Firestore timestamps
      if (sessionData.scheduledStart) {
        firestoreData.scheduledStart = admin.firestore.Timestamp.fromDate(
          sessionData.scheduledStart instanceof Date
            ? sessionData.scheduledStart
            : new Date(sessionData.scheduledStart),
        );
      }
      if (sessionData.scheduledEnd) {
        firestoreData.scheduledEnd = admin.firestore.Timestamp.fromDate(
          sessionData.scheduledEnd instanceof Date
            ? sessionData.scheduledEnd
            : new Date(sessionData.scheduledEnd),
        );
      }
      if (sessionData.scheduledDateTime) {
        firestoreData.scheduledDateTime = admin.firestore.Timestamp.fromDate(
          sessionData.scheduledDateTime instanceof Date
            ? sessionData.scheduledDateTime
            : new Date(sessionData.scheduledDateTime),
        );
      }
      if (sessionData.endDateTime) {
        firestoreData.endDateTime = admin.firestore.Timestamp.fromDate(
          sessionData.endDateTime instanceof Date
            ? sessionData.endDateTime
            : new Date(sessionData.endDateTime),
        );
      }
      if (sessionData.requestedAt) {
        firestoreData.requestedAt = admin.firestore.Timestamp.fromDate(
          sessionData.requestedAt instanceof Date
            ? sessionData.requestedAt
            : new Date(sessionData.requestedAt),
        );
      }
      if (sessionData.acceptedAt) {
        firestoreData.acceptedAt = admin.firestore.Timestamp.fromDate(
          sessionData.acceptedAt instanceof Date
            ? sessionData.acceptedAt
            : new Date(sessionData.acceptedAt),
        );
      }
      if (sessionData.rejectedAt) {
        firestoreData.rejectedAt = admin.firestore.Timestamp.fromDate(
          sessionData.rejectedAt instanceof Date
            ? sessionData.rejectedAt
            : new Date(sessionData.rejectedAt),
        );
      }
      if (sessionData.declinedAt) {
        firestoreData.declinedAt = admin.firestore.Timestamp.fromDate(
          sessionData.declinedAt instanceof Date
            ? sessionData.declinedAt
            : new Date(sessionData.declinedAt),
        );
      }
      if (sessionData.cancelledAt) {
        firestoreData.cancelledAt = admin.firestore.Timestamp.fromDate(
          sessionData.cancelledAt instanceof Date
            ? sessionData.cancelledAt
            : new Date(sessionData.cancelledAt),
        );
      }
      if (sessionData.rescheduledAt) {
        firestoreData.rescheduledAt = admin.firestore.Timestamp.fromDate(
          sessionData.rescheduledAt instanceof Date
            ? sessionData.rescheduledAt
            : new Date(sessionData.rescheduledAt),
        );
      }
      if (sessionData.completedAt) {
        firestoreData.completedAt = admin.firestore.Timestamp.fromDate(
          sessionData.completedAt instanceof Date
            ? sessionData.completedAt
            : new Date(sessionData.completedAt),
        );
      }
      if (sessionData.paymentProof?.submittedAt) {
        firestoreData.paymentProof = {
          ...sessionData.paymentProof,
          submittedAt: admin.firestore.Timestamp.fromDate(
            sessionData.paymentProof.submittedAt instanceof Date
              ? sessionData.paymentProof.submittedAt
              : new Date(sessionData.paymentProof.submittedAt),
          ),
        };
      }

      if (id) {
        const docRef = this.firebaseService.getFirestore().collection(this.STANDARD_COLLECTION).doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          firestoreData.createdAt = this.firebaseService.getTimestamp();
        }
        await docRef.set(firestoreData, { merge: true });
        return id;
      } else {
        const colRef = this.firebaseService.getFirestore().collection(this.STANDARD_COLLECTION);
        firestoreData.createdAt = this.firebaseService.getTimestamp();
        const docRef = await colRef.add(firestoreData);
        return docRef.id;
      }
    } catch (error) {
      this.logger.error('Error saving session:', error);
      throw error;
    }
  }

  async findByTutor(tutorId: string, limit: number = 50): Promise<TutoringSession[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .orderBy('scheduledStart', 'desc')
        .limit(limit)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push(this.mapDocToSession(doc.id, data));
      });

      return sessions;
    } catch (error) {
      this.logger.error('Error finding sessions by tutor:', error);
      throw error;
    }
  }

  async findByStudent(studentId: string, limit: number = 50): Promise<TutoringSession[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('studentId', '==', studentId)
        .orderBy('scheduledStart', 'desc')
        .limit(limit)
        .get();
      console.log("Snapshot", snapshot.docs)
      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push(this.mapDocToSession(doc.id, data));
      });

      return sessions;
    } catch (error) {
      this.logger.error('Error finding sessions by student:', error);
      throw error;
    }
  }

  async findByStatus(status: string, limit: number = 50): Promise<TutoringSession[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('status', '==', status)
        .orderBy('scheduledStart', 'desc')
        .limit(limit)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push(this.mapDocToSession(doc.id, data));
      });

      return sessions;
    } catch (error) {
      this.logger.error('Error finding sessions by status:', error);
      throw error;
    }
  }

  async findByTutorAndStatus(
    tutorId: string,
    status: string,
    limit: number = 50,
  ): Promise<TutoringSession[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('status', '==', status)
        .orderBy('scheduledStart', 'desc')
        .limit(limit)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push(this.mapDocToSession(doc.id, data));
      });

      return sessions;
    } catch (error) {
      this.logger.error('Error finding sessions by tutor and status:', error);
      throw error;
    }
  }

  async findByTutorAndApprovalStatus(
    tutorId: string,
    approvalStatus: string,
    limit: number = 50,
  ): Promise<TutoringSession[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('tutorApprovalStatus', '==', approvalStatus)
        .orderBy('requestedAt', 'desc')
        .limit(limit)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push(this.mapDocToSession(doc.id, data));
      });

      return sessions;
    } catch (error) {
      this.logger.error('Error finding sessions by tutor and approval status:', error);
      throw error;
    }
  }

  private mapDocToSession(id: string, data: any): TutoringSession {
    const reviews = Array.isArray(data.reviews)
      ? data.reviews.map((r: any) => ({
          ...r,
          createdAt: r?.createdAt?.toDate ? r.createdAt.toDate() : r?.createdAt,
          updatedAt: r?.updatedAt?.toDate ? r.updatedAt.toDate() : r?.updatedAt,
        }))
      : undefined;

    return {
      id,
      tutorId: data.tutorId,
      studentId: data.studentId ,
      scheduledStart: data.scheduledStart
        ? data.scheduledStart.toDate()
        : data.scheduledDateTime?.toDate() || data.startDateTime?.toDate(),
      scheduledEnd: data.scheduledEnd
        ? data.scheduledEnd.toDate()
        : data.endDateTime?.toDate(),
      status: data.status,
      courseId: data.courseId,
      course: data.course,
      tutorApprovalStatus: data.tutorApprovalStatus,
      paymentId: data.paymentId,
      paymentStatus: data.paymentStatus,
      location: data.location,
      notes: data.notes,
      rating: data.rating,
      review: data.review,
      reviews,
      averageRating: data.averageRating,
      price: data.price,
      parentAvailabilityId: data.parentAvailabilityId,
      slotIndex: data.slotIndex,
      slotId: data.slotId,
      googleEventId: data.googleEventId,
      calicoCalendarEventId: data.calicoCalendarEventId,
      calicoCalendarHtmlLink: data.calicoCalendarHtmlLink,
      meetLink: data.meetLink,
      requestedAt: data.requestedAt?.toDate(),
      acceptedAt: data.acceptedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
      declinedAt: data.declinedAt?.toDate(),
      rejectionReason: data.rejectionReason,
      cancelledBy: data.cancelledBy,
      cancelledAt: data.cancelledAt?.toDate(),
      cancellationReason: data.cancellationReason,
      rescheduledAt: data.rescheduledAt?.toDate(),
      rescheduledReason: data.rescheduledReason,
      completedAt: data.completedAt?.toDate(),
      paymentProof: data.paymentProof,
      tutorEmail: data.tutorEmail,
      studentEmail: data.studentEmail,
      studentName: data.studentName,
      tutorName: data.tutorName,
      scheduledDateTime: data.scheduledDateTime?.toDate(),
      endDateTime: data.endDateTime?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as TutoringSession;
  }

  async findUpcomingSessionsByTutor(tutorId: string, limit: number = 2): Promise<TutoringSession[]> {
    try {
      const now = new Date();
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const session = this.mapDocToSession(doc.id, data);
        // Filter only future sessions (scheduledStart > now)
        if (session.scheduledStart && new Date(session.scheduledStart) > now) {
          sessions.push(session);
        }
      });

      // Sort by scheduledStart ascending (nearest first)
      sessions.sort((a, b) => {
        const dateA = new Date(a.scheduledStart).getTime();
        const dateB = new Date(b.scheduledStart).getTime();
        return dateA - dateB;
      });

      return sessions.slice(0, limit);
    } catch (error) {
      this.logger.error('Error finding upcoming sessions by tutor:', error);
      throw error;
    }
  }

  async findPreviousSessionsByTutor(tutorId: string, limit: number = 2): Promise<TutoringSession[]> {
    try {
      const now = new Date();
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      const sessions: TutoringSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const session = this.mapDocToSession(doc.id, data);
        // Filter only past sessions (scheduledStart < now)
        if (session.scheduledStart && new Date(session.scheduledStart) < now) {
          sessions.push(session);
        }
      });

      // Sort by scheduledStart descending (most recent first)
      sessions.sort((a, b) => {
        const dateA = new Date(a.scheduledStart).getTime();
        const dateB = new Date(b.scheduledStart).getTime();
        return dateB - dateA;
      });

      return sessions.slice(0, limit);
    } catch (error) {
      this.logger.error('Error finding previous sessions by tutor:', error);
      throw error;
    }
  }

  /**
   * Find the next confirmed session for a tutor starting within 60 minutes from now
   */
  async findUpcomingSessionWithin60Minutes(
    tutorId: string,
  ): Promise<{ studentName: string; minutesToStart: number } | null> {
    try {
      const now = new Date();
      const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .where('status', '==', 'confirmed')
        .get();

      let nextSession: any = null;
      let minDifference = Infinity;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const session = this.mapDocToSession(doc.id, data);

        if (session.scheduledStart) {
          const startTime = new Date(session.scheduledStart);

          // Check if session starts within the next 60 minutes
          if (startTime > now && startTime <= sixtyMinutesFromNow) {
            const timeDifference = startTime.getTime() - now.getTime();
            // Keep track of the nearest session
            if (timeDifference < minDifference) {
              minDifference = timeDifference;
              nextSession = session;
            }
          }
        }
      });

      if (!nextSession) {
        return null;
      }

      const minutesToStart = Math.floor(minDifference / (60 * 1000));

      return {
        studentName: nextSession.studentName || 'Unknown Student',
        minutesToStart,
      };
    } catch (error) {
      this.logger.error(
        `Error finding upcoming sessions within 60 minutes for tutor ${tutorId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all sessions for a tutor in the last 2 years
   * Used by analytics for occupancy calculations (searches both collections)
   */
  async getTutorSessionsLast2Years(tutorId: string): Promise<TutoringSession[]> {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const db = this.firebaseService.getFirestore();
      const sessions: TutoringSession[] = [];

      // Search in standard collection
      const snapshot1 = await db
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      snapshot1.forEach(doc => {
        const session = this.mapDocToSession(doc.id, doc.data());
        if (session && session.createdAt && new Date(session.createdAt) >= twoYearsAgo) {
          sessions.push(session);
        }
      });

      // Also search in alternative collection name (tutoringSessions) for legacy data
      try {
        const snapshot2 = await db
          .collection('tutoringSessions')
          .where('tutorId', '==', tutorId)
          .get();

        snapshot2.forEach(doc => {
          if (!sessions.find(s => s.id === doc.id)) {
            const session = this.mapDocToSession(doc.id, doc.data());
            if (session && session.createdAt && new Date(session.createdAt) >= twoYearsAgo) {
              sessions.push(session);
            }
          }
        });
      } catch (e) {
        // Collection might not exist, continue
      }

      return sessions;
    } catch (error) {
      this.logger.error(`Error fetching sessions for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Get all sessions for a tutor-subject combination in the last 2 years
   * Used by analytics for occupancy calculations (searches both collections)
   */
  async getTutorSubjectSessionsLast2Years(
    tutorId: string,
    subjectId: string,
  ): Promise<TutoringSession[]> {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const db = this.firebaseService.getFirestore();
      const sessions: TutoringSession[] = [];

      // Search in standard collection
      const snapshot1 = await db
        .collection(this.STANDARD_COLLECTION)
        .where('tutorId', '==', tutorId)
        .get();

      snapshot1.forEach(doc => {
        const data = doc.data();
        if (data.subject === subjectId || data.subjectId === subjectId) {
          const session = this.mapDocToSession(doc.id, data);
          if (session && session.createdAt && new Date(session.createdAt) >= twoYearsAgo) {
            sessions.push(session);
          }
        }
      });

      // Also search in alternative collection name (tutoringSessions) for legacy data
      try {
        const snapshot2 = await db
          .collection('tutoringSessions')
          .where('tutorId', '==', tutorId)
          .get();

        snapshot2.forEach(doc => {
          if (!sessions.find(s => s.id === doc.id)) {
            const data = doc.data();
            if (data.subject === subjectId || data.subjectId === subjectId) {
              const session = this.mapDocToSession(doc.id, data);
              if (session && session.createdAt && new Date(session.createdAt) >= twoYearsAgo) {
                sessions.push(session);
              }
            }
          }
        });
      } catch (e) {
        // Collection might not exist, continue
      }

      return sessions;
    } catch (error) {
      this.logger.error(
        `Error fetching sessions for tutor ${tutorId}, subject ${subjectId}:`,
        error,
      );
      throw error;
    }
  }
}

