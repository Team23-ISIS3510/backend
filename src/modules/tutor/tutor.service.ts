import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { AvailabilityRepository } from '../availability/availability.repository';
import { AcademicService } from '../academic/academic.service';
import { Course } from '../academic/entities/course.entity';

export interface SanitizedTutor {
  id: string;
  name: string;
  email: string;
  isTutor: boolean;
  rating: number | null;
  hourlyRate: number | null;
  bio: string;
  courses: string[];
  profilePictureUrl: string | null;
  location?: string;
  totalSessions?: number;
  hasAvailability?: boolean;
  nextAvailableSlot?: any;
  upcomingSessions?: number;
  totalAvailabilities?: number;
}

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly academicService: AcademicService,
  ) {}

  /**
   * Sanitize tutor data - remove sensitive information
   * id = document ID (Firestore document ID)
   * email = email field from document (separate from id)
   */
  private sanitizeTutor(docOrObj: any, extra: any = {}): SanitizedTutor {
    const isDoc = typeof docOrObj?.data === 'function';
    const raw = isDoc ? docOrObj.data() : docOrObj;
    // id is the Firestore document ID (different from email)
    const id = isDoc ? docOrObj.id : (docOrObj.id || docOrObj.uid);
    // email is the email field from the document (separate from id)
    const email = isDoc ? (raw?.email ?? '') : (docOrObj.email ?? '');
    return {
      id, // Document ID (e.g., "abc123")
      name: raw?.name ?? '',
      email: email, // Email field (e.g., "tutor@example.com") - separate from id
      isTutor: !!raw?.isTutor,
      rating: typeof raw?.rating === 'number' ? raw.rating : null,
      hourlyRate:
        typeof raw?.hourlyRate === 'number'
          ? raw.hourlyRate
          : typeof raw?.hourly_rate === 'number'
          ? raw.hourly_rate
          : null,
      bio: raw?.bio ?? '',
      courses: Array.isArray(raw?.courses) ? raw.courses : [],
      profilePictureUrl: raw?.profilePictureUrl ?? null,
      location: raw?.location ?? 'Virtual',
      ...extra,
    };
  }

  /**
   * Get all tutors
   */
  async getAllTutors(): Promise<SanitizedTutor[]> {
    try {
      this.logger.log('Fetching all tutors from Firebase');
      const db = this.firebaseService.getFirestore();
      const usersSnapshot = await db.collection('users').where('isTutor', '==', true).get();

      const tutors = usersSnapshot.docs.map((doc) => this.sanitizeTutor(doc));

      // Sort by rating descending
      tutors.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

      this.logger.log(`Found ${tutors.length} tutors`);
      return tutors;
    } catch (error) {
      this.logger.error('Error fetching tutors from Firebase:', error);
      throw new Error(`Error fetching tutors: ${error.message}`);
    }
  }

  /**
   * Get tutors by course ID
   * NOTE: In Firebase user collection, courses are stored as "courses" array
   */
  async getTutorsByCourse(courseId: string): Promise<SanitizedTutor[]> {
    try {
      this.logger.log(`Fetching tutors for course: ${courseId}`);
      const db = this.firebaseService.getFirestore();

      // Search by courses array
      const usersSnapshot = await db
        .collection('users')
        .where('isTutor', '==', true)
        .where('courses', 'array-contains', courseId)
        .get();

      this.logger.log(`Found ${usersSnapshot.docs.length} tutors with course ${courseId}`);

      const tutors: SanitizedTutor[] = [];

      // Enrich each tutor with availability information
      for (const doc of usersSnapshot.docs) {
        const tutor = this.sanitizeTutor(doc);

        try {
          // Get tutor's availability
          const availability = await this.availabilityRepository.findByTutor(tutor.id, 20);
          const now = new Date();
          const upcomingAvailability = availability.filter(
            (a) => a.startDateTime && new Date(a.startDateTime) > now,
          );

          // Add availability info
          tutor.totalAvailabilities = availability.length;
          tutor.hasAvailability = availability.length > 0;
          tutor.upcomingSessions = upcomingAvailability.length;

          // Get next available slot
          if (upcomingAvailability.length > 0) {
            const sortedAvailability = [...upcomingAvailability].sort(
              (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
            );
            tutor.nextAvailableSlot = sortedAvailability[0];
          }
        } catch (availError) {
          this.logger.warn(`Could not fetch availability for tutor ${tutor.id}:`, availError);
          tutor.totalAvailabilities = 0;
          tutor.hasAvailability = false;
          tutor.upcomingSessions = 0;
        }

        tutors.push(tutor);
      }

      // Fallback: If no tutors found by courses, try searching in availability by course
      if (tutors.length === 0) {
        this.logger.log(`No tutors found by courses array, searching by availability course`);
        try {
          const availabilities = await this.availabilityRepository.findByCourse(courseId, 100);
          const tutorIds = [...new Set(availabilities.map((a) => a.tutorId))];

          this.logger.log(`Found ${tutorIds.length} unique tutors from availability`);

          const allTutors = await this.getAllTutors();
          const matchingTutors = allTutors.filter((t) => tutorIds.includes(t.id));

          // Add availability info
          for (const tutor of matchingTutors) {
            const tutorAvailability = availabilities.filter((a) => a.tutorId === tutor.id);
            tutor.totalAvailabilities = tutorAvailability.length;
            tutor.hasAvailability = true;
            tutor.upcomingSessions = tutorAvailability.filter(
              (a) => new Date(a.startDateTime) > new Date(),
            ).length;
          }

          tutors.push(...matchingTutors);
        } catch (availError) {
          this.logger.warn('Error searching by availability:', availError);
        }
      }

      // Sort by: has availability first, then by rating, then by hourly rate
      tutors.sort((a, b) => {
        // Prioritize tutors with availability
        if (a.hasAvailability && !b.hasAvailability) return -1;
        if (!a.hasAvailability && b.hasAvailability) return 1;

        // Then by rating
        const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
        if (ratingDiff !== 0) return ratingDiff;

        // Finally by hourly rate (lower is better)
        const rateA = a.hourlyRate ?? Number.MAX_SAFE_INTEGER;
        const rateB = b.hourlyRate ?? Number.MAX_SAFE_INTEGER;
        return rateA - rateB;
      });

      this.logger.log(`Returning ${tutors.length} tutors for course ${courseId}`);
      return tutors;
    } catch (error) {
      this.logger.error(`Error fetching tutors by course ${courseId}:`, error);
      throw new Error(`Error fetching tutors by course: ${error.message}`);
    }
  }

  /**
   * Search tutors by name or course
   */
  async searchTutors(searchTerm?: string): Promise<SanitizedTutor[]> {
    try {
      const allTutors = await this.getAllTutors();

      if (!searchTerm || !searchTerm.trim()) {
        return allTutors;
      }

      const query = searchTerm.toLowerCase().trim();
      this.logger.log(`Searching tutors with term: ${query}`);

      const filtered = allTutors.filter((tutor) => {
        // Search in name
        if (tutor.name.toLowerCase().includes(query)) return true;

        // Search in courses
        if (
          Array.isArray(tutor.courses) &&
          tutor.courses.some((c) => c.toLowerCase().includes(query))
        ) {
          return true;
        }

        // Search in bio
        if (tutor.bio && tutor.bio.toLowerCase().includes(query)) return true;

        return false;
      });

      this.logger.log(`Found ${filtered.length} tutors matching "${query}"`);
      return filtered;
    } catch (error) {
      this.logger.error('Error searching tutors:', error);
      throw new Error(`Error searching tutors: ${error.message}`);
    }
  }

  /**
   * Get tutor by ID or email
   * Supports both document ID lookup and email field lookup
   * id and email are different - id is document ID, email is email field
   */
  async getTutorById(tutorId: string): Promise<SanitizedTutor | null> {
    try {
      this.logger.log(`Fetching tutor: ${tutorId}`);
      const db = this.firebaseService.getFirestore();
      
      // Try by document ID first
      let userDoc = await db.collection('users').doc(tutorId).get();

      // If not found by document ID and it looks like an email, try by email field
      if (!userDoc.exists && tutorId.includes('@')) {
        const emailQuery = await db.collection('users')
          .where('email', '==', tutorId)
          .where('isTutor', '==', true)
          .limit(1)
          .get();
        
        if (!emailQuery.empty) {
          userDoc = emailQuery.docs[0];
        }
      }

      if (!userDoc.exists) {
        this.logger.warn(`Tutor ${tutorId} not found`);
        return null;
      }

      const userData = userDoc.data();
      if (!userData?.isTutor) {
        this.logger.warn(`User ${tutorId} is not a tutor`);
        return null;
      }

      const tutor = this.sanitizeTutor(userDoc);
      // Use document ID (not email) for availability lookup
      const tutorDocumentId = userDoc.id;

      // Add availability info
      try {
        const availability = await this.availabilityRepository.findByTutor(tutorDocumentId, 50);
        const now = new Date();
        const upcoming = availability.filter((a) => new Date(a.startDateTime) > now);

        tutor.totalAvailabilities = availability.length;
        tutor.hasAvailability = availability.length > 0;
        tutor.upcomingSessions = upcoming.length;

        if (upcoming.length > 0) {
          const sorted = [...upcoming].sort(
            (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
          );
          tutor.nextAvailableSlot = sorted[0];
        }
      } catch (availError) {
        this.logger.warn(`Could not fetch availability for tutor ${tutorDocumentId}:`, availError);
      }

      return tutor;
    } catch (error) {
      this.logger.error(`Error fetching tutor ${tutorId}:`, error);
      throw new Error(`Error fetching tutor: ${error.message}`);
    }
  }

  /**
   * Get tutor statistics
   * tutorId can be document ID or email - converts to document ID for availability lookup
   */
  async getTutorStats(tutorId: string) {
    try {
      this.logger.log(`Fetching stats for tutor: ${tutorId}`);

      // Get tutor to find document ID (id is different from email)
      const tutor = await this.getTutorById(tutorId);
      if (!tutor) {
        return {
          totalAvailabilities: 0,
          upcomingSessions: 0,
          courses: [],
          courseCount: 0,
        };
      }

      // Use document ID (tutor.id) for availability lookup, not email
      const availability = await this.availabilityRepository.findByTutor(tutor.id, 100);
      const now = new Date();

      const courses = [...new Set(availability.map((a) => a.course).filter(Boolean))];
      const upcoming = availability.filter((a) => a.startDateTime && new Date(a.startDateTime) > now);

      return {
        totalAvailabilities: availability.length,
        upcomingSessions: upcoming.length,
        courses,
        courseCount: courses.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching stats for tutor ${tutorId}:`, error);
      return {
        totalAvailabilities: 0,
        upcomingSessions: 0,
        courses: [],
        courseCount: 0,
      };
    }
  }

  /**
   * Get tutor availability
   * tutorId can be document ID or email - converts to document ID for availability lookup
   */
  async getTutorAvailability(tutorId: string, limit: number = 20) {
    try {
      this.logger.log(`Fetching availability for tutor: ${tutorId}, limit: ${limit}`);
      
      // Get tutor to find document ID (id is different from email)
      const tutor = await this.getTutorById(tutorId);
      if (!tutor) {
        return [];
      }

      // Use document ID (tutor.id) for availability lookup, not email
      const availability = await this.availabilityRepository.findByTutor(tutor.id, limit);
      return availability;
    } catch (error) {
      this.logger.error(`Error fetching availability for tutor ${tutorId}:`, error);
      throw new Error(`Error fetching tutor availability: ${error.message}`);
    }
  }

  /**
   * Get courses for a tutor
   * Returns the full course objects that the tutor is allowed to teach
   */
  async getTutorCourses(tutorId: string): Promise<Course[]> {
    try {
      this.logger.log(`Fetching courses for tutor: ${tutorId}`);
      const db = this.firebaseService.getFirestore();

      // Try by document ID first
      let userDoc = await db.collection('users').doc(tutorId).get();

      // If not found by document ID and it looks like an email, try by email field
      if (!userDoc.exists && tutorId.includes('@')) {
        const emailQuery = await db
          .collection('users')
          .where('email', '==', tutorId)
          .where('isTutor', '==', true)
          .limit(1)
          .get();

        if (!emailQuery.empty) {
          userDoc = emailQuery.docs[0];
        }
      }

      if (!userDoc.exists) {
        this.logger.warn(`Tutor ${tutorId} not found`);
        throw new NotFoundException(`Tutor ${tutorId} not found`);
      }

      const userData = userDoc.data();
      if (!userData?.isTutor) {
        this.logger.warn(`User ${tutorId} is not a tutor`);
        throw new NotFoundException(`User ${tutorId} is not a tutor`);
      }

      const courseIds = Array.isArray(userData?.courses) ? userData.courses : [];
      this.logger.log(`Found ${courseIds.length} course IDs for tutor ${tutorId}: ${courseIds.join(', ')}`);

      // Fetch full course objects for each course ID
      const courses: Course[] = [];
      for (const courseId of courseIds) {
        try {
          const course = await this.academicService.getCourseById(courseId);
          if (course) {
            courses.push(course);
          } else {
            this.logger.warn(`Course ${courseId} not found for tutor ${tutorId}`);
          }
        } catch (courseError) {
          this.logger.warn(`Error fetching course ${courseId}:`, courseError);
        }
      }

      this.logger.log(`Returning ${courses.length} courses for tutor ${tutorId}`);
      return courses;
    } catch (error) {
      this.logger.error(`Error fetching courses for tutor ${tutorId}:`, error);
      throw error;
    }
  }

  /**
   * Create a tutor application for a course
   * Stores application in tutorApplications collection
   */
  async createCourseApplication(
    tutorId: string,
    courseId: string,
    notes?: string,
  ) {
    try {
      this.logger.log(`Creating course application: tutor ${tutorId} for course ${courseId}`);

      const db = this.firebaseService.getFirestore();

      // Get tutor details
      const tutor = await this.getTutorById(tutorId);
      if (!tutor) {
        throw new NotFoundException(`Tutor ${tutorId} not found`);
      }

      // Get course details
      const course = await this.academicService.getCourseById(courseId);
      if (!course) {
        throw new NotFoundException(`Course ${courseId} not found`);
      }

      // Check if tutor already applied for this course (just log it, don't block)
      try {
        const existingQuery = await db
          .collection('tutorApplications')
          .where('tutorId', '==', tutorId)
          .where('courseId', '==', courseId)
          .limit(1)
          .get();

        if (!existingQuery.empty) {
          const existingApp = existingQuery.docs[0].data();
          if (existingApp.status === 'pending') {
            this.logger.warn(`Tutor ${tutorId} already has pending application for course ${courseId}`);
            throw new Error(
              `You already have a pending application for this course`,
            );
          }
        }
      } catch (checkError) {
        if (checkError.message.includes('pending')) {
          throw checkError;
        }
        this.logger.warn(`Could not check existing applications: ${checkError.message}`);
      }

      // Create application
      const application = {
        tutorId,
        tutorEmail: tutor.email,
        tutorName: tutor.name,
        courseId,
        courseName: course.name,
        courseCode: course.code,
        status: 'pending',
        appliedAt: new Date(),
        notes: notes || null,
      };

      const docRef = await db.collection('tutorApplications').add(application);

      this.logger.log(
        `Course application created: ${docRef.id} for tutor ${tutorId}`,
      );

      return {
        id: docRef.id,
        ...application,
      };
    } catch (error) {
      this.logger.error(
        `Error creating course application for tutor ${tutorId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all applications for a tutor
   */
  async getTutorApplications(tutorId: string) {
    try {
      this.logger.log(`Fetching applications for tutor: ${tutorId}`);

      const db = this.firebaseService.getFirestore();

      const snapshot = await db
        .collection('tutorApplications')
        .where('tutorId', '==', tutorId)
        .get();

      const applications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Sort client-side by appliedAt descending
      applications.sort((a: any, b: any) => {
        const dateA = a.appliedAt instanceof Date ? a.appliedAt : new Date(a.appliedAt);
        const dateB = b.appliedAt instanceof Date ? b.appliedAt : new Date(b.appliedAt);
        return dateB.getTime() - dateA.getTime();
      });

      this.logger.log(
        `Found ${applications.length} applications for tutor ${tutorId}`,
      );

      return applications;
    } catch (error) {
      this.logger.error(
        `Error fetching applications for tutor ${tutorId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all pending applications (admin only)
   */
  async getPendingApplications() {
    try {
      this.logger.log(`Fetching all pending applications`);

      const db = this.firebaseService.getFirestore();

      const snapshot = await db
        .collection('tutorApplications')
        .where('status', '==', 'pending')
        .get();

      const applications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Sort client-side by appliedAt descending
      applications.sort((a: any, b: any) => {
        const dateA = a.appliedAt instanceof Date ? a.appliedAt : new Date(a.appliedAt);
        const dateB = b.appliedAt instanceof Date ? b.appliedAt : new Date(b.appliedAt);
        return dateB.getTime() - dateA.getTime();
      });

      this.logger.log(`Found ${applications.length} pending applications`);

      return applications;
    } catch (error) {
      this.logger.error(`Error fetching pending applications:`, error);
      throw error;
    }
  }

  /**
   * Approve a tutor application and add course to tutor's courses
   */
  async approveApplication(applicationId: string, reviewedBy: string) {
    try {
      this.logger.log(`Approving application: ${applicationId}`);

      const db = this.firebaseService.getFirestore();

      // Get application
      const appDoc = await db
        .collection('tutorApplications')
        .doc(applicationId)
        .get();

      if (!appDoc.exists) {
        throw new NotFoundException(`Application ${applicationId} not found`);
      }

      const appData = appDoc.data() as any;
      const { tutorId, courseId } = appData;

      // Add course to tutor's courses array
      const userRef = db.collection('users').doc(tutorId);
      await userRef.update({
        courses: admin.firestore.FieldValue.arrayUnion(courseId),
      });

      // Update application status
      const updateData: Record<string, any> = {
        status: 'approved',
        reviewedAt: new Date(),
      };
      if (reviewedBy !== undefined) {
        updateData.reviewedBy = reviewedBy;
      }
      await appDoc.ref.update(updateData);

      this.logger.log(
        `Application ${applicationId} approved. Course ${courseId} added to tutor ${tutorId}`,
      );

      return {
        id: applicationId,
        ...appData,
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy,
      };
    } catch (error) {
      this.logger.error(`Error approving application ${applicationId}:`, error);
      throw error;
    }
  }

  /**
   * Reject a tutor application
   */
  async rejectApplication(
    applicationId: string,
    rejectionReason: string,
    reviewedBy: string,
  ) {
    try {
      this.logger.log(`Rejecting application: ${applicationId}`);

      const db = this.firebaseService.getFirestore();

      // Get application
      const appDoc = await db
        .collection('tutorApplications')
        .doc(applicationId)
        .get();

      if (!appDoc.exists) {
        throw new NotFoundException(`Application ${applicationId} not found`);
      }

      const appData = appDoc.data();

      // Update application status
      const updateData: Record<string, any> = {
        status: 'rejected',
        rejectionReason,
        reviewedAt: new Date(),
      };
      if (reviewedBy !== undefined) {
        updateData.reviewedBy = reviewedBy;
      }
      await appDoc.ref.update(updateData);

      this.logger.log(`Application ${applicationId} rejected`);

      return {
        id: applicationId,
        ...appData,
        status: 'rejected',
        rejectionReason,
        reviewedAt: new Date(),
        reviewedBy,
      };
    } catch (error) {
      this.logger.error(`Error rejecting application ${applicationId}:`, error);
      throw error;
    }
  }
}