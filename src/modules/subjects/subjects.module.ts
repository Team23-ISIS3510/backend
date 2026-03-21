import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [FirebaseModule, UserModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
