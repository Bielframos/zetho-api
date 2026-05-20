import { Module } from '@nestjs/common';
import { ZCoinsController } from './zcoins.controller';
import { ZCoinsService } from './zcoins.service';

@Module({
  controllers: [ZCoinsController],
  providers: [ZCoinsService],
  exports: [ZCoinsService],
})
export class ZCoinsModule {}
