import { Module } from '@nestjs/common';
import { EvolutionService } from './evolution.service';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [EvolutionService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
