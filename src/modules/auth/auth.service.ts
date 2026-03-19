import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
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
    const authUser = await this.firebase.getAuth().createUser({
      email: dto.email,
      password: dto.password,
      displayName: dto.name,
    });
    const { password: _, ...userFields } = dto;
    return this.userService.create(authUser.uid, userFields);
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
      const { data } = await firstValueFrom(
        this.httpService.post<AuthResponseDto>(
          `${this.identityUrl}:signInWithPassword?key=${this.firebaseApiKey}`,
          {
            email: dto.email,
            password: dto.password,
            returnSecureToken: true,
          },
        ),
      );
      return data;
    } catch (error: any) {
      const message = error?.response?.data?.error?.message ?? '';
      if (
        message.includes('EMAIL_NOT_FOUND') ||
        message.includes('INVALID_PASSWORD') ||
        message.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw new InternalServerErrorException('Login failed');
    }
  }

  async changePassword(uid: string, newPassword: string): Promise<void> {
    await this.firebase.getAuth().updateUser(uid, { password: newPassword });
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
