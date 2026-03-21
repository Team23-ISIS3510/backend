import { IsEmail, IsString, MinLength, IsBoolean, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'maria@example.com', description: 'User email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'securePass123', minLength: 6, description: 'Password (minimum 6 characters)' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'María García', description: 'Full name' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '+573001234567', description: 'Phone number' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: false, description: 'Whether the user is registering as a tutor' })
  @IsBoolean()
  isTutor!: boolean;

  @ApiProperty({
    example: ['ISIS3710', 'ISIS2603'],
    description: 'Course IDs the tutor teaches (only relevant when isTutor is true)',
    required: false,
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];
}
