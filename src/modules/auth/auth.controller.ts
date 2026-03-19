import { Controller, Post, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import type { DecodedIdToken } from 'firebase-admin/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a Firebase Auth account and a Firestore user document. Returns the created user profile.',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error in request body.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates via Firebase Identity Toolkit. Returns a Firebase `idToken` to be used as `Bearer <idToken>` in the Authorize header.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Login successful. Copy the idToken and use it in Authorize.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: 'Change password (requires authentication)',
    description: 'Updates the password for the currently authenticated user. Send the Firebase idToken in the Authorization header.',
  })
  @ApiResponse({ status: 204, description: 'Password changed successfully.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token.' })
  @ApiBearerAuth('firebase-jwt')
  @Patch('change-password')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: DecodedIdToken, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.uid, dto.newPassword);
  }

  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Receives a Firebase idToken obtained after Google OAuth on the client. Automatically registers the user if they do not exist yet.',
  })
  @ApiResponse({ status: 200, description: 'Google sign-in successful.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired Google idToken.' })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  googleSignIn(@Body() dto: GoogleAuthDto) {
    return this.authService.googleSignIn(dto.idToken);
  }
}
