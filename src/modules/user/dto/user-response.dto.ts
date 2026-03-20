import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: 'uid_abc123', description: 'Firebase Auth UID (also the Firestore document ID)' })
  id!: string;

  get uid(): string { return this.id; }

  @ApiProperty({ example: 'maria@example.com' })
  email!: string;

  @ApiProperty({ example: 'María García' })
  name!: string;

  @ApiProperty({ example: '+573001234567' })
  phone!: string;

  @ApiProperty({ example: false })
  isTutor!: boolean;

  @ApiProperty({ example: ['ISIS3710'], required: false, type: [String] })
  courses?: string[];

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ example: 'I am a dedicated student...', required: false })
  description?: string;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.phone = user.phone;
    dto.isTutor = user.isTutor;
    dto.courses = user.courses ?? [];
    dto.description = user.description;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
