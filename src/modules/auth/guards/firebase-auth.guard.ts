import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);
    request.user = await this.authService.verifyToken(token);
    return true;
  }
}

