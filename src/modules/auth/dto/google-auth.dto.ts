import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Firebase idToken obtained after completing Google OAuth on the client side',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  idToken!: string;
}
