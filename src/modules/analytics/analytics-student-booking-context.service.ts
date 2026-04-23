import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';

/** Firestore collection: one row per tutoring session creation (attribution + flow, no session schema change). */
export const STUDENT_BOOKING_CONTEXT_COLLECTION = 'student_booking_context';

export interface StudentBookingContextRow {
  studentId: string;
  sessionId: string;
  bookedAt: Date;
  bookingSource: string | null;
  instantAtCreate: boolean;
}

@Injectable()
export class AnalyticsStudentBookingContextService {
  private readonly logger = new Logger(AnalyticsStudentBookingContextService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Called after a tutoring session is persisted. Best-effort: failures are logged, never thrown.
   */
  async recordSessionBookingContext(params: {
    studentId: string;
    sessionId: string;
    bookedAt: Date;
    bookingSource: string | null;
    instantAtCreate: boolean;
  }): Promise<void> {
    const db = this.firebaseService.getFirestore();
    await db.collection(STUDENT_BOOKING_CONTEXT_COLLECTION).add({
      studentId: params.studentId,
      sessionId: params.sessionId,
      bookedAt: admin.firestore.Timestamp.fromDate(params.bookedAt),
      bookingSource: params.bookingSource,
      instantAtCreate: params.instantAtCreate,
    });
  }

  /**
   * Full scan + in-memory date filter (same pattern as feature-correlation session fetch).
   */
  async fetchSince(since: Date): Promise<StudentBookingContextRow[]> {
    const db = this.firebaseService.getFirestore();
    const snap = await db.collection(STUDENT_BOOKING_CONTEXT_COLLECTION).get();
    const out: StudentBookingContextRow[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const bookedAt = toDate(d.bookedAt);
      if (!bookedAt || bookedAt < since) return;
      if (!d.studentId || !d.sessionId) return;
      const src = d.bookingSource;
      const bookingSource =
        typeof src === 'string' && src.length > 0 ? String(src).slice(0, 64) : null;
      out.push({
        studentId: String(d.studentId),
        sessionId: String(d.sessionId),
        bookedAt,
        bookingSource,
        instantAtCreate: Boolean(d.instantAtCreate),
      });
    });
    this.logger.log(`student_booking_context: ${out.length} rows in analysis window`);
    return out;
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
