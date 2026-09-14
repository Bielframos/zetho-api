import { Module } from '@nestjs/common';
import { RankingModule } from '../ranking/ranking.module';
import { ZCoinsController } from './zcoins.controller';
import { ZCoinsService } from './zcoins.service';

@Module({
  imports: [RankingModule],
  controllers: [ZCoinsController],
  providers: [ZCoinsService],
  exports: [ZCoinsService],
})
export class ZCoinsModule {}
