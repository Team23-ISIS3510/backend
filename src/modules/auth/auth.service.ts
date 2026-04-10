import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FirebaseService } from '../firebase/firebase.service';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';
import type { DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly identityUrl = 'https://identitytoolkit.googleapis.com/v1/accounts';


  constructor(
    private readonly firebase: FirebaseService,
    private readonly userService: UserService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async verifyToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.firebase.getAuth().verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    // 1. Create Firebase Auth user
    const authUser = await this.firebase.getAuth().createUser({
      email: dto.email,
      password: dto.password,
      displayName: dto.name,
    });

    try {
      // 2. Create Firestore user document
      const { password: _, ...userFields } = dto;
      return await this.userService.create(authUser.uid, userFields);
    } catch (err: any) {
      // Rollback: Delete Firebase Auth user if Firestore write fails
      try {
        await this.firebase.getAuth().deleteUser(authUser.uid);
      } catch (deleteErr) {
        Logger.warn(
          `Failed to rollback Firebase Auth user ${authUser.uid} after Firestore error`,
          deleteErr,
        );
      }
      throw this.mapFirebaseError(err);
    }
  }

  // ── Firebase error → HTTP exception ─────────────────────────────────────────

  private mapFirebaseError(err: any): Error {
    const code: string = err?.errorInfo?.code ?? err?.code ?? '';

    const firebaseMessages: Record<string, () => Error> = {
      'auth/email-already-exists': () =>
        new ConflictException(
          'That email address is already registered. Please log in or use a different email.',
        ),
      'auth/invalid-email': () =>
        new BadRequestException('The email address is not valid.'),
      'auth/weak-password': () =>
        new BadRequestException(
          'Password is too weak. Please use at least 6 characters.',
        ),
      'auth/invalid-password': () =>
        new BadRequestException(
          'Password must be at least 6 characters long.',
        ),
      'auth/phone-number-already-exists': () =>
        new ConflictException(
          'That phone number is already linked to another account.',
        ),
      'auth/uid-already-exists': () =>
        new ConflictException('An account with that ID already exists.'),
      'auth/user-not-found': () =>
        new UnauthorizedException('No account found with that email address.'),
      'auth/wrong-password': () =>
        new UnauthorizedException('Incorrect password. Please try again.'),
      'auth/too-many-requests': () =>
        new UnauthorizedException(
          'Too many failed attempts. Please wait a few minutes and try again.',
        ),
    };

    const factory = firebaseMessages[code];
    if (factory) return factory();

    Logger.error('Unhandled Firebase error', err);
    return new InternalServerErrorException(
      'Something went wrong. Please try again later.',
    );
  }

  private get firebaseApiKey(): string {
    const apiKey = this.configService.get<string>('FIREBASE_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('Missing FIREBASE_API_KEY');
    }
    return apiKey;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    try {
      this.logger.debug(`Login attempt for ${dto.email}`);
      
      const response$ = this.httpService.post<AuthResponseDto>(
        `${this.identityUrl}:signInWithPassword?key=${this.firebaseApiKey}`,
        {
          email: dto.email,
          password: dto.password,
          returnSecureToken: true,
        },
      );

      const { data } = await firstValueFrom(response$);
      this.logger.debug(`Login successful for ${dto.email}`);
      return data;
    } catch (error: any) {
      // Log detailed error for debugging
      const statusCode = error?.response?.status;
      const firebaseError = error?.response?.data?.error?.message ?? '';
      
      this.logger.error('Login error', {
        email: dto.email,
        statusCode,
        firebaseError,
        errorCode: error?.code,
        message: error?.message,
      });

      // Handle specific Firebase errors
      if (
        firebaseError.includes('EMAIL_NOT_FOUND') ||
        firebaseError.includes('INVALID_PASSWORD') ||
        firebaseError.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Handle network/timeout errors
      if (!error?.response) {
        this.logger.error(`Network error during login for ${dto.email}:`, error?.message);
        throw new InternalServerErrorException('Unable to connect to authentication service');
      }

      // Return original Firebase error if available
      if (firebaseError) {
        throw new UnauthorizedException(firebaseError);
      }

      throw new InternalServerErrorException('Login failed');
    }
  }

  async changePassword(uid: string, newPassword: string): Promise<void> {
    try {
      await this.firebase.getAuth().updateUser(uid, { password: newPassword });
    } catch (err: any) {
      throw this.mapFirebaseError(err);
    }
  }

  async googleSignIn(idToken: string): Promise<{ user: UserResponseDto; isNew: boolean }> {
    return this.resolveUserFromIdToken(idToken);
  }

  private async resolveUserFromIdToken(
    idToken: string,
  ): Promise<{ user: UserResponseDto; isNew: boolean }> {
    const decoded = await this.verifyToken(idToken);
    const existingUser = await this.userService.findByIdOrNull(decoded.uid);
    if (existingUser) {
      return { user: existingUser, isNew: false };
    }

    const email = decoded.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated token does not include an email');
    }

    const createdUser = await this.userService.create(decoded.uid, {
      email,
      name: decoded.name ?? email,
      phone: '',
      isTutor: false,
    });

    return { user: createdUser, isNew: true };
  }
}
