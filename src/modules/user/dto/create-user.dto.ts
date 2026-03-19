import { IsString, IsEmail, IsBoolean, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'María García' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '+573001234567' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: false, description: 'True if the user is a tutor' })
  @IsBoolean()
  isTutor!: boolean;

  @ApiProperty({
    example: ['ISIS3710'],
    required: false,
    type: [String],
    description: 'Course IDs the tutor teaches (only used when isTutor is true)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];
}
