import { Module } from '@nestjs/common';
import { IGDBController } from './igdb.controller';
import { IGDBService } from './igdb.service';

@Module({
  controllers: [IGDBController],
  providers: [IGDBService],
  exports: [IGDBService],
})
export class IGDBModule {}
