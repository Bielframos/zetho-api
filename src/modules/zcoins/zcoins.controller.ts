import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { ZCoinsService } from './zcoins.service';
import { ZCoinInputDto, ZCoinOutputDto } from './zcoins.dto';

@Controller('zcoins')
export class ZCoinsController {
  constructor(private readonly zCoinsService: ZCoinsService) {}

  @Get('leaderboard/weekly')
  async weeklyLeaderboard(@Query('limit') limit?: string) {
    const safeLimit = this.parsePositiveInt(limit, 30);
    return this.zCoinsService.getWeeklyLeaderboard(safeLimit);
  }

  @Post('input')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async input(@Req() req: any, @Body() body: ZCoinInputDto) {
    const user = req.user as Models.User;
    return this.zCoinsService.applyInput(user.$id, body.reason, body.bonusId);
  }

  @Post('output')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async output(@Req() req: any, @Body() body: ZCoinOutputDto) {
    const user = req.user as Models.User;
    return this.zCoinsService.applyOutput(user.$id, body.reason);
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
