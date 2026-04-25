import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Firebase idToken obtained after completing Google OAuth on the client side',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  idToken!: string;

  @ApiProperty({
    description: 'User ID (optional)',
    example: 'user123',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_id?: string;
}
