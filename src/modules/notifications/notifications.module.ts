import { Module } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EvolutionService } from './evolution.service';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [EmailTemplateService, EvolutionService, NotificationsService],
  exports: [EmailTemplateService, NotificationsService],
})
export class NotificationsModule {}
