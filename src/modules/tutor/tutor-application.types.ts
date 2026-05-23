import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Course } from '../academic/entities/course.entity';

export class TutorApplicationDto {
  @ApiProperty({ example: 'tutor-123', description: 'Tutor ID' })
  tutorId: string;

  @ApiProperty({ example: 'course-456', description: 'Course ID to apply for' })
  courseId: string;

  @ApiProperty({
    example: 'I have strong knowledge in this area',
    description: 'Optional notes from the tutor',
    required: false,
  })
  notes?: string;
}

export class TutorApplicationResponseDto {
  @ApiProperty({ example: 'app-123' })
  id: string;

  @ApiProperty({ example: 'tutor-123' })
  tutorId: string;

  @ApiProperty({ example: 'tutor@example.com' })
  tutorEmail: string;

  @ApiProperty({ example: 'John Doe' })
  tutorName: string;

  @ApiProperty({ example: 'course-456' })
  courseId: string;

  @ApiProperty({ example: 'Cálculo Diferencial' })
  courseName: string;

  @ApiProperty({ example: 'MAT1104' })
  courseCode: string;

  @ApiProperty({ example: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status: string;

  @ApiProperty()
  appliedAt: Date;

  @ApiProperty({ required: false })
  reviewedAt?: Date;

  @ApiProperty({ required: false })
  notes?: string;
}

export interface TutorApplication {
  id?: string;
  tutorId: string;
  tutorEmail: string;
  tutorName: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

// Hot Slots Analysis DTOs
export class HotSlotDto {
  @ApiProperty({
    example: '2024-01-15T14:00:00Z',
    description: 'Start time of the 1-hour slot (ISO 8601 format)',
  })
  slotStart: Date;

  @ApiProperty({
    example: '2024-01-15T15:00:00Z',
    description: 'End time of the 1-hour slot (ISO 8601 format)',
  })
  slotEnd: Date;

  @ApiProperty({
    example: 5,
    description: 'Number of tutoring sessions booked in this slot during the last week',
  })
  bookingCount: number;

  @ApiProperty({
    example: 'available',
    enum: ['available', 'not_available'],
    description: 'Tutor availability status in this hot slot',
  })
  tutorAvailability: 'available' | 'not_available';

  @ApiProperty({
    example: '2024-01-10T14:00:00Z',
    description: 'Start of the availability window (if available)',
    required: false,
  })
  availabilityStart?: Date;

  @ApiProperty({
    example: '2024-01-10T18:00:00Z',
    description: 'End of the availability window (if available)',
    required: false,
  })
  availabilityEnd?: Date;
}

export class HotSlotsAnalysisResponseDto {
  @ApiProperty({
    example: 'tutor-123',
    description: 'The tutor ID',
  })
  tutorId: string;

  @ApiProperty({
    example: '2024-01-08T00:00:00Z',
    description: 'Start of the analysis period (7 days ago)',
  })
  analysisStartDate: Date;

  @ApiProperty({
    example: '2024-01-15T23:59:59Z',
    description: 'End of the analysis period (today)',
  })
  analysisEndDate: Date;

  @ApiProperty({
    example: 25,
    description: 'Total number of tutoring sessions in the last week',
  })
  totalSessionsLastWeek: number;

  @ApiProperty({
    type: [HotSlotDto],
    description: 'Top 3 most booked 1-hour slots with tutor availability info',
  })
  hotSlots: HotSlotDto[];
}

export class TutorCourseWithNotesDto extends Course {
  @ApiProperty({
    example: 'Focus on recursion and dynamic programming explanations',
    description: 'Private note for the tutor about this course',
    required: false,
  })
  note?: string;
}

export class UpdateTutorCourseNoteDto {
  @ApiProperty({
    example: 'Focus on recursion and dynamic programming explanations',
    description: 'Private note for the tutor about this course',
  })
  @IsString()
  @IsNotEmpty()
  note: string;
}

export class TutorCourseNoteResponseDto {
  @ApiProperty({ example: 'tutor-123', description: 'Tutor ID' })
  tutorId: string;

  @ApiProperty({ example: 'course-456', description: 'Course ID' })
  courseId: string;

  @ApiProperty({
    example: 'Focus on recursion and dynamic programming explanations',
    description: 'Private note for the tutor about this course',
  })
  note: string;
}
