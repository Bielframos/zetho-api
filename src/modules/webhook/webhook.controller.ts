import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IGDBGuard } from 'src/common/guards/igdb.guard';
import type { IGDBGameWebhook, IGDBGenre } from '../igdb/igdb.types';
import { IGDBHandler } from './handlers/igdb.handler';
@Controller('webhook')
export class WebhookController {
  constructor(private readonly IGDBHandler: IGDBHandler) {}
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
