import { Module } from '@nestjs/common';
import { WebhookReplayService } from './replay.service';

@Module({
  providers: [WebhookReplayService],
  exports: [WebhookReplayService],
})
export class WebhookReplayModule {}
