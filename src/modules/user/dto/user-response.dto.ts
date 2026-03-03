import { User } from '../entities/user.entity';

export class UserResponseDto {
  id!: string;
  email!: string;
  name!: string;
  phone!: string;
  isTutor!: boolean;
  courses?: string[];
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.phone = user.phone;
    dto.isTutor = user.isTutor;
    if (user.isTutor) dto.courses = user.courses ?? [];
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
