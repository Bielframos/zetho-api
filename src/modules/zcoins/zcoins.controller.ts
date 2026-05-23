import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ZCoinsService } from './zcoins.service';

type ZCoinBody = {
  userId: string;
  reason: string;
  bonusId?: string | null;
};

@Controller('zcoins')
export class ZCoinsController {
  constructor(private readonly zCoinsService: ZCoinsService) {}

  @Get('leaderboard/weekly')
  async weeklyLeaderboard(@Query('limit') limit?: string) {
    const safeLimit = this.parsePositiveInt(limit, 20);
    return this.zCoinsService.getWeeklyLeaderboard(safeLimit);
  }

  @Post('input')
  async input(@Body() body: ZCoinBody) {
    return this.zCoinsService.applyInput(
      body.userId,
      body.reason,
      body.bonusId,
    );
  }

  @Post('output')
  async output(@Body() body: ZCoinBody) {
    return this.zCoinsService.applyOutput(body.userId, body.reason);
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }
}
