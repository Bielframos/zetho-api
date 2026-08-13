import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { GameService } from './game.service';
import { SearchGamesDto, HypedUpcomingDto } from './game.dto';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('search')
  search(@Query() dto: SearchGamesDto) {
    return this.gameService.search(dto);
  }

  @Get('hyped-upcoming')
  findHypedUpcoming(@Query() dto: HypedUpcomingDto) {
    return this.gameService.findHypedUpcoming(dto);
  }

  @Post(':gameId/notifications/toggle')
  @UseGuards(AppwriteSessionGuard)
  toggleNotifications(
    @Req() req: any,
    @Param('gameId') gameId: string,
    @Body('active') active: boolean,
  ) {
    const user = req.user as Models.User;
    return this.gameService.toggleNotifications(user.$id, gameId, active);
  }

  @Get(':slug')
  findBySlug(
    @Param('slug') slug: string,
    @Query('select') select?: string,
    @Query('enrich') enrich?: string,
  ) {
    // O enriquecimento dispara import IGDB + tradução por IA dentro do
    // request. No caminho de SSR isso estoura o timeout da função — o render
    // do servidor chama com `enrich=false`.
    return this.gameService.findBySlug(slug, select, {
      enrich: enrich !== 'false',
    });
  }

  @Get(':slug/medias')
  findMedias(@Param('slug') slug: string) {
    return this.gameService.findMediasBySlug(slug);
  }

  @Get(':slug/hero')
  findHeroImage(@Param('slug') slug: string) {
    return this.gameService.findHeroImageBySlug(slug);
  }
}
