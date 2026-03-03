import { IsString, IsEmail, IsBoolean, IsArray, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsBoolean()
  isTutor: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];
}
