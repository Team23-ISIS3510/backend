import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
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
    private readonly config: ConfigService,
  ) {}

  private get apiKey(): string {
    return this.config.getOrThrow<string>('NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  // ── Token verification (used by guard) ──────────────────────────────────────

  async verifyToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.firebase.getAuth().verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // ── Register (email/password) ────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    try {
      // 1. Create Firebase Auth user
      const authUser = await this.firebase.getAuth().createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.name,
      });

      // 2. Create Firestore user document
      const { password: _, ...userFields } = dto;
      return this.userService.create(authUser.uid, userFields);
    } catch (err: any) {
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

    this.logger.error('Unhandled Firebase error', err);
    return new InternalServerErrorException(
      'Something went wrong. Please try again later.',
    );
  }

  // ── Login (email/password) ───────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ idToken: string; refreshToken: string; expiresIn: string }>(
          `${this.identityUrl}:signInWithPassword?key=${this.apiKey}`,
          { email: dto.email, password: dto.password, returnSecureToken: true },
        ),
      );
      return { idToken: data.idToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn };
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? '';
      if (message.includes('EMAIL_NOT_FOUND') || message.includes('INVALID_PASSWORD') || message.includes('INVALID_LOGIN_CREDENTIALS')) {
        throw new UnauthorizedException('Invalid email or password');
      }
      this.logger.error('Login error', err);
      throw new InternalServerErrorException('Login failed');
    }
  }

  // ── Change password (requires valid token → uid from guard) ─────────────────

  async changePassword(uid: string, newPassword: string): Promise<void> {
    try {
      await this.firebase.getAuth().updateUser(uid, { password: newPassword });
    } catch (err: any) {
      throw this.mapFirebaseError(err);
    }
  }

  // ── Google sign-in (client sends Firebase ID token after Google auth) ────────

  async googleSignIn(idToken: string): Promise<{ user: UserResponseDto; isNew: boolean }> {
    const decoded = await this.verifyToken(idToken);

    let user = await this.userService.findByIdOrNull(decoded.uid);
    let isNew = false;

    if (!user) {
      // Auto-register with info from Google token
      user = await this.userService.create(decoded.uid, {
        email: decoded.email!,
        name: decoded.name ?? decoded.email!,
        phone: '',
        isTutor: false,
      });
      isNew = true;
    }

    return { user, isNew };
  }
}
