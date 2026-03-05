import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Major } from './entities/major.entity';
import { Course } from './entities/course.entity';

@Injectable()
export class AcademicRepository {
  private readonly logger = new Logger(AcademicRepository.name);
  private readonly majorCollection = 'major';
  private readonly courseCollection = 'course';

  constructor(private readonly firebaseService: FirebaseService) {}

  private mapCourseDoc(doc: any): Course {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const data = doc.data ? doc.data() : doc;
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      id: doc.id,
      ...data,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      createdAt: this.firebaseService.parseDate(data?.createdAt) as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      updatedAt: this.firebaseService.parseDate(data?.updatedAt) as any,
    } as Course;
  }

  private mapMajorDoc(doc: any): Major {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = doc.data ? doc.data() : doc;
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      id: doc.id,
      ...data,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      createdAt: this.firebaseService.parseDate(data?.createdAt) as any,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      updatedAt: this.firebaseService.parseDate(data?.updatedAt) as any,
    } as Major;
  }

  // ===== COURSES =====
  async findAllCourses(): Promise<Course[]> {
    try {
      const snapshot = await this.firebaseService
        .collection(this.courseCollection)
        .get();
      return snapshot.docs.map((doc) => this.mapCourseDoc(doc));
    } catch (error) {
      this.logger.error('Error fetching courses', error);
      throw error;
    }
  }

  async findCourseById(id: string): Promise<Course | null> {
    try {
      const doc = await this.firebaseService
        .collection(this.courseCollection)
        .doc(id)
        .get();
      if (!doc.exists) {
        return null;
      }
      return this.mapCourseDoc(doc);
    } catch (error) {
      this.logger.error(`Error fetching course ${id}`, error);
      throw error;
    }
  }

  async findCoursesByTutor(tutorId: string): Promise<Course[]> {
    try {
      // First, get the tutor's courses array
      const userDoc = await this.firebaseService
        .collection('users')
        .doc(tutorId)
        .get();
      if (!userDoc.exists) {
        return [];
      }

      const userData = userDoc.data();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const courseIds = userData?.courses || [];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (courseIds.length === 0) {
        return [];
      }

      // Fetch all courses that match the tutor's course IDs
      const courses: Course[] = [];
      for (const courseId of courseIds) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const course = await this.findCourseById(courseId);
        if (course) {
          courses.push(course);
        }
      }

      return courses;
    } catch (error) {
      this.logger.error(`Error fetching courses for tutor ${tutorId}`, error);
      throw error;
    }
  }

  async createCourse(courseData: Partial<Course>): Promise<Course> {
    try {
      const data = {
        ...courseData,
        createdAt: this.firebaseService.getDateTimeString(),
        updatedAt: this.firebaseService.getDateTimeString(),
      };
      const docRef = await this.firebaseService
        .collection(this.courseCollection)
        .add(data);
      const doc = await docRef.get();
      return this.mapCourseDoc(doc);
    } catch (error) {
      this.logger.error('Error creating course', error);
      throw error;
    }
  }

  async updateCourse(
    id: string,
    courseData: Partial<Course>,
  ): Promise<Course | null> {
    try {
      const docRef = this.firebaseService
        .collection(this.courseCollection)
        .doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }
      const data = {
        ...courseData,
        updatedAt: this.firebaseService.getDateTimeString(),
      };
      await docRef.update(data);
      const updatedDoc = await docRef.get();

      return this.mapCourseDoc(updatedDoc);
    } catch (error) {
      this.logger.error(`Error updating course ${id}`, error);
      throw error;
    }
  }

  async deleteCourse(id: string): Promise<void> {
    try {
      await this.firebaseService
        .collection(this.courseCollection)
        .doc(id)
        .delete();
    } catch (error) {
      this.logger.error(`Error deleting course ${id}`, error);
      throw error;
    }
  }

  // ===== MAJORS =====
  async findAllMajors(): Promise<Major[]> {
    try {
      const snapshot = await this.firebaseService
        .collection(this.majorCollection)
        .get();
      return snapshot.docs.map((doc) => this.mapMajorDoc(doc));
    } catch (error) {
      this.logger.error('Error fetching majors', error);
      throw error;
    }
  }

  async findMajorById(id: string): Promise<Major | null> {
    try {
      const doc = await this.firebaseService
        .collection(this.majorCollection)
        .doc(id)
        .get();
      if (!doc.exists) {
        return null;
      }
      return this.mapMajorDoc(doc);
    } catch (error) {
      this.logger.error(`Error fetching major ${id}`, error);
      throw error;
    }
  }

  async createMajor(majorData: Partial<Major>): Promise<Major> {
    try {
      const data = {
        ...majorData,
        createdAt: this.firebaseService.getDateTimeString(),
        updatedAt: this.firebaseService.getDateTimeString(),
      };
      const docRef = await this.firebaseService
        .collection(this.majorCollection)
        .add(data);
      const doc = await docRef.get();
      return this.mapMajorDoc(doc);
    } catch (error) {
      this.logger.error('Error creating major', error);
      throw error;
    }
  }

  async updateMajor(
    id: string,
    majorData: Partial<Major>,
  ): Promise<Major | null> {
    try {
      const docRef = this.firebaseService
        .collection(this.majorCollection)
        .doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }
      const data = {
        ...majorData,
        updatedAt: this.firebaseService.getDateTimeString(),
      };
      await docRef.update(data);
      const updatedDoc = await docRef.get();

      return this.mapMajorDoc(updatedDoc);
    } catch (error) {
      this.logger.error(`Error updating major ${id}`, error);
      throw error;
    }
  }

  async deleteMajor(id: string): Promise<void> {
    try {
      await this.firebaseService
        .collection(this.majorCollection)
        .doc(id)
        .delete();
    } catch (error) {
      this.logger.error(`Error deleting major ${id}`, error);
      throw error;
    }
  }
}
