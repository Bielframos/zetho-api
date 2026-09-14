import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { RankingService } from './ranking.service';
import { RankingQueryDto } from './ranking.dto';

interface AuthenticatedRequest extends Request {
  user: Models.User;
}

@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('zcoins/weekly')
  async getWeeklyZCoins(@Query() query: RankingQueryDto) {
    return this.rankingService.getWeeklyZCoinsLeaderboard(query.limit);
  }

  @Get('connections/completed-games')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async getConnectionsCompletedGames(
    @Req() req: AuthenticatedRequest,
    @Query() query: RankingQueryDto,
  ) {
    return this.rankingService.getConnectionsCompletedGamesLeaderboard(
      req.user.$id,
      query.limit,
    );
  }
}
