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
import { IGDBGuard } from 'src/common/guards/igdb.guard';
import type { IGDBGame, IGDBGenre } from '../igdb/igdb.types';
import { ZethoHandler } from './handlers/zetho.handler';
import { IGDBHandler } from './handlers/igdb.handler';

@Controller('webhook')
export class WebhookController {
  constructor(
    private zethoHandler: ZethoHandler,
    private IGDBHandler: IGDBHandler,
  ) {}

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

    return this.zethoHandler.syncEntry(entry);
  }

  @Post('igdb/games/upsert')
  @UseGuards(IGDBGuard)
  IGDBUpsertGame(@Body() game: IGDBGame) {
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
