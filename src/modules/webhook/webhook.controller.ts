import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ZEntries } from 'infra/appwrite';
import { AppwriteWebhookGuard } from 'src/common/guards/webhook.gaurd';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  constructor(private service: WebhookService) {}

  @Post('entry-sync')
  @UseGuards(AppwriteWebhookGuard)
  syncZEntry(@Body() entry: ZEntries) {
    return this.service.syncEntry(entry);
  }
}
