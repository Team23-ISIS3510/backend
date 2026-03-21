import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [FirebaseModule, UserModule, HttpModule],
  controllers: [AuthController],
  providers: [AuthService, FirebaseAuthGuard],
  exports: [AuthService, FirebaseAuthGuard],
})
export class AuthModule {}
