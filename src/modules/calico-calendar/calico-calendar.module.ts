import { Module } from '@nestjs/common';
import { CalicoCalendarController } from './calico-calendar.controller';
import { CalicoCalendarService } from './calico-calendar.service';

@Module({
  controllers: [CalicoCalendarController],
  providers: [CalicoCalendarService],
  exports: [CalicoCalendarService],
})
export class CalicoCalendarModule {}
