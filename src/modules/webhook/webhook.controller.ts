import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ZEntries } from 'infra/appwrite';
import { AppwriteWebhookGuard } from 'src/common/guards/webhook.guard';
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
      throw new HttpException('Evento não suportado.', HttpStatus.OK);
    }

    return this.service.syncEntry(entry);
  }
}
