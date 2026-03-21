import { Injectable } from '@nestjs/common';
import { AcademicRepository } from './academic.repository';
import { Major } from './entities/major.entity';
import { Course } from './entities/course.entity';

@Injectable()
export class AcademicService {
  constructor(private readonly academicRepository: AcademicRepository) {}

  // ===== COURSES =====
  async getAllCourses(): Promise<Course[]> {
    return await this.academicRepository.findAllCourses();
  }

  async getCourseById(id: string): Promise<Course | null> {
    return await this.academicRepository.findCourseById(id);
  }

  async getCoursesByTutor(tutorId: string): Promise<Course[]> {
    return await this.academicRepository.findCoursesByTutor(tutorId);
  }

  async createCourse(courseData: Partial<Course>): Promise<Course> {
    return await this.academicRepository.createCourse(courseData);
  }

  async updateCourse(
    id: string,
    courseData: Partial<Course>,
  ): Promise<Course | null> {
    return await this.academicRepository.updateCourse(id, courseData);
  }

  async deleteCourse(id: string): Promise<void> {
    return await this.academicRepository.deleteCourse(id);
  }

  // ===== MAJORS =====
  async getAllMajors(): Promise<Major[]> {
    return await this.academicRepository.findAllMajors();
  }

  async getMajorById(id: string): Promise<Major | null> {
    return await this.academicRepository.findMajorById(id);
  }

  async createMajor(majorData: Partial<Major>): Promise<Major> {
    return await this.academicRepository.createMajor(majorData);
  }

  async updateMajor(
    id: string,
    majorData: Partial<Major>,
  ): Promise<Major | null> {
    return await this.academicRepository.updateMajor(id, majorData);
  }

  async deleteMajor(id: string): Promise<void> {
    return await this.academicRepository.deleteMajor(id);
  }
}
