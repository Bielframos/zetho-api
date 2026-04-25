import { Controller, Get, Param, Query } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

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
