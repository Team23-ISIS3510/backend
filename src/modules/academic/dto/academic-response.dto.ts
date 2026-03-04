import { ApiProperty } from '@nestjs/swagger';
import { Major } from '../entities/major.entity';
import { Course } from '../entities/course.entity';

export class GetMajorsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [Major] })
  majors: Major[];

  @ApiProperty({ example: 10 })
  count: number;
}

export class GetCoursesResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [Course] })
  courses: Course[];

  @ApiProperty({ example: 50 })
  count: number;
}
