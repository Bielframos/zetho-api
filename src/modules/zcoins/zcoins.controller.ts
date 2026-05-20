import { Body, Controller, Post } from '@nestjs/common';
import { ZCoinsService } from './zcoins.service';

type ZCoinBody = {
  userId: string;
  reason: string;
};

@Controller('zcoins')
export class ZCoinsController {
  constructor(private readonly zCoinsService: ZCoinsService) {}

  @Post('input')
  async input(@Body() body: ZCoinBody) {
    return this.zCoinsService.applyInput(body.userId, body.reason);
  }

  @Post('output')
  async output(@Body() body: ZCoinBody) {
    return this.zCoinsService.applyOutput(body.userId, body.reason);
  }
}
