import { ApiProperty } from '@nestjs/swagger';

export class Course {
  @ApiProperty({
    example: 'course-123',
    description: 'The unique identifier of the course',
  })
  id: string;

  @ApiProperty({
    example: 'Web Development',
    description: 'The name of the course',
  })
  name: string;

  @ApiProperty({ example: 'ISIS3710', description: 'The code of the course' })
  code: string;

  @ApiProperty({
    example: 3,
    description: 'The number of credits for the course',
  })
  credits: number;

  @ApiProperty({
    example: 'Engineering',
    description: 'The faculty the course belongs to',
  })
  faculty: string;

  @ApiProperty({
    example: ['course-101'],
    description: 'List of prerequisite course IDs',
    required: false,
  })
  prerequisites?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  description?: string;
}
