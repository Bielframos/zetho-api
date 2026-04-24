import { Module } from '@nestjs/common';
import { IGDBController } from './igdb.controller';
import { IGDBService } from './igdb.service';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';

@Module({
  controllers: [IGDBController],
  providers: [IGDBService, SystemApiKeyGuard],
  exports: [IGDBService],
})
export class IGDBModule {}
