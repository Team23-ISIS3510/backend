import { ApiProperty } from '@nestjs/swagger';

export class Major {
  @ApiProperty({
    example: 'major-123',
    description: 'The unique identifier of the major',
  })
  id: string;

  @ApiProperty({
    example: 'Systems Engineering',
    description: 'The name of the major',
  })
  name: string;

  @ApiProperty({
    example: 'Engineering',
    description: 'The faculty the major belongs to',
  })
  faculty: string;

  @ApiProperty({ example: 'ISIS', description: 'The code of the major' })
  code: string;
  createdAt?: Date;
  updatedAt?: Date;
}
