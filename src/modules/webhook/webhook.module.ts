import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { IGDBModule } from '../igdb/igdb.module';

@Module({
  imports: [IGDBModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
