import { ApiProperty } from '@nestjs/swagger';

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
