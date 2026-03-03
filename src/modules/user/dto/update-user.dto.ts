import { IsString, IsBoolean, IsArray, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isTutor?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];
}
