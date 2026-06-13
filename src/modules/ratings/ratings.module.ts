import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { ZCoinsModule } from '../zcoins/zcoins.module';

@Module({
  imports: [ZCoinsModule],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
