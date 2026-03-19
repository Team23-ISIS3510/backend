import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'maria@example.com', description: 'Registered email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'securePass123', minLength: 6, description: 'Account password' })
  @IsString()
  @MinLength(6)
  password!: string;
}
