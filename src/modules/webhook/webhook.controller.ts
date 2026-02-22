import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ZEntries } from 'infra/appwrite';
import { AppwriteWebhookGuard } from 'src/common/guards/webhook.gaurd';

@Controller('webhook')
export class WebhookController {
  constructor() {}

  @Post('entry-sync')
  @UseGuards(AppwriteWebhookGuard)
  syncZEntry(@Body() entry: ZEntries) {
    console.log('Webhook executado');
    console.log(entry);
    return { message: 'Webhook executado' };
  }
}
