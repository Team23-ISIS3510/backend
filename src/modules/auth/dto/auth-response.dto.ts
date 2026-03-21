import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'Firebase JWT — use this as `Bearer <idToken>` in the Authorize header' })
  idToken!: string;

  @ApiProperty({ description: 'Firebase refresh token (use to renew the idToken when it expires)' })
  refreshToken!: string;

  @ApiProperty({ example: '3600', description: 'Token expiry time in seconds' })
  expiresIn!: string;
}
