import { IsString, IsBoolean, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'María García', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '+573001234567', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: true, required: false, description: 'Toggle tutor status' })
  @IsBoolean()
  @IsOptional()
  isTutor?: boolean;

  @ApiProperty({
    example: ['ISIS3710', 'ISIS2603'],
    required: false,
    type: [String],
    description: 'Replace the full list of courses the tutor teaches',
  })

  @ApiProperty({ example: 'I am a dedicated student...', required: false})
  

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courses?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}
