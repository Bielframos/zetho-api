import { Module } from '@nestjs/common';
import { IGDBModule } from '../igdb/igdb.module';
import { ZethoHandler } from './handlers/zetho.handler';
import { WebhookController } from './webhook.controller';
import { IGDBHandler } from './handlers/igdb.handler';
import { WebhookReplayModule } from './replay/replay.module';

@Module({
  imports: [IGDBModule, WebhookReplayModule],
  controllers: [WebhookController],
  providers: [ZethoHandler, IGDBHandler],
})
export class WebhookModule {}
