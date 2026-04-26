import { Controller, Get, Param, Query } from '@nestjs/common';
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

  @Get(':slug')
  findBySlug(@Param('slug') slug: string, @Query('select') select?: string) {
    return this.gameService.findBySlug(slug, select);
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
