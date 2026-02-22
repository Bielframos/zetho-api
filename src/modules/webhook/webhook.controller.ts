import {
  Body,
  Controller,
  Headers,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { ZEntries } from 'infra/appwrite';
import { AppwriteWebhookGuard } from 'src/common/guards/webhook.gaurd';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  constructor(private service: WebhookService) {}

  @Post('entry-sync')
  @UseGuards(new AppwriteWebhookGuard('entry-sync'))
  syncZEntry(
    @Headers('x-appwrite-webhook-events') events: string,
    @Body() entry: ZEntries,
  ) {
    const eventArray = events.split(',');

    if (!eventArray.some((event) => event.endsWith('.create'))) {
      throw new UnprocessableEntityException('Evento não suportado');
    }

    return this.service.syncEntry(entry);
  }
}
