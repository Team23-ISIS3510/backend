import { IsEmail, IsString, MinLength, IsBoolean, IsArray, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsBoolean()
  isTutor!: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];
}
