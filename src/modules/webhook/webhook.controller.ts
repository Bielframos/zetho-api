import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { ZEntries } from 'src/infra/appwrite/appwrite';
import { AppwriteWebhookGuard } from 'src/common/guards/webhook.guard';
import { IGDBGuard } from 'src/common/guards/igdb.guard';
import type { IGDBGameWebhook, IGDBGenre } from '../igdb/igdb.types';
import { ZethoHandler } from './handlers/zetho.handler';
import { IGDBHandler } from './handlers/igdb.handler';
import { WebhookReplayService } from './replay/replay.service';
import { TimelineService } from 'src/system/dashboard/timeline.service';

@Controller('webhook')
export class WebhookController {
  constructor(
    private zethoHandler: ZethoHandler,
    private IGDBHandler: IGDBHandler,
    private readonly replayService: WebhookReplayService,
    private readonly timelineService: TimelineService,
  ) {}

  @Post('timeline')
  @UseGuards(new AppwriteWebhookGuard('timeline'))
  ingestTimeline(
    @Body() row: any,
    @Headers('x-appwrite-webhook-events') events: string,
  ) {
    const event = String(events ?? '')
      .split(',')
      .map((item) => item.trim())
      .find((item) =>
        /\.tables\.[^.]+\.rows\.[^.]+\.(create|update|delete)$/.test(item),
      );
    const match = event?.match(
      /\.tables\.([^.]+)\.rows\.[^.]+\.(create|update|delete)$/,
    );
    if (!match) return { success: true, noOp: true };
    if (match[1] === 'connections')
      return match[2] === 'create'
        ? this.timelineService.backfillConnection(row)
        : this.timelineService.invalidateConnection(row);
    return this.timelineService.ingest(
      match[1],
      row,
      match[2] as 'create' | 'update' | 'delete',
    );
  }

  @Post('entry-sync')
  @UseGuards(new AppwriteWebhookGuard('entry-sync'))
  async syncZEntry(
    @Body() entry: ZEntries,
    @Headers('x-appwrite-webhook-events') events: string,
    @Headers('x-appwrite-webhook-id') webhookId?: string,
    @Headers('x-appwrite-trigger') trigger?: string,
  ) {
    const eventArray = String(events ?? '')
      .split(',')
      .map((event) => event.trim())
      .filter(Boolean);

    if (!eventArray.some((event) => event.endsWith('.create'))) {
      return {
        message: 'Evento não suportado.',
        success: true,
        noOp: true,
        reason: 'unsupported_event',
      };
    }

    const replayKey = `${webhookId ?? trigger ?? entry.$id}:${entry.$id}`;
    const duplicated = await this.replayService.isDuplicate(replayKey);

    if (duplicated) {
      return {
        message: 'Evento duplicado ignorado',
        success: true,
        noOp: true,
        reason: 'duplicate_event',
      };
    }

    try {
      return await this.zethoHandler.syncEntry(entry);
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          message: error.message,
          success: true,
          noOp: true,
          reason: 'idempotent_conflict',
        };
      }

      throw new HttpException(
        'Falha interna ao processar webhook',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('comments/on-create')
  @UseGuards(new AppwriteWebhookGuard('comments/on-create'))
  handleCommentCreate(
    @Body() comment: any,
    @Headers('x-appwrite-webhook-events') events: string,
  ) {
    const eventArray = String(events ?? '')
      .split(',')
      .map((event) => event.trim())
      .filter(Boolean);

    if (!eventArray.some((event) => event.endsWith('.create'))) {
      return {
        message: 'Evento não suportado.',
        success: true,
        noOp: true,
        reason: 'unsupported_event',
      };
    }

    return this.zethoHandler.handleCommentCreate(comment);
  }

  @Post('igdb/games/upsert')
  @UseGuards(IGDBGuard)
  IGDBUpsertGame(@Body() game: IGDBGameWebhook) {
    return this.IGDBHandler.upsertGame(game);
  }

  @Post('igdb/genres/upsert')
  @UseGuards(IGDBGuard)
  IGDBUpsertGenre(@Body() genre: IGDBGenre) {
    return this.IGDBHandler.upsertGenre(genre);
  }

  @Post('igdb/genres/delete')
  @UseGuards(IGDBGuard)
  IGDBDeleteGenre(@Body() genre: IGDBGenre) {
    return this.IGDBHandler.deleteGenre(genre);
  }
}
