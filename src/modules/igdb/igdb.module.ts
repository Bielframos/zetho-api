import { GameSearchQueueService } from './game-search-queue.service';
import { Module } from '@nestjs/common';
import { IGDBController } from './igdb.controller';
import { IGDBService } from './igdb.service';
import { IGDBCoordinationService } from './igdb-coordination.service';
import { IGDBUpsertService } from './igdb-upsert.service';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';

@Module({
  controllers: [IGDBController],
  providers: [
    GameSearchQueueService,
    IGDBService,
    IGDBCoordinationService,
    IGDBUpsertService,
    SystemApiKeyGuard,
  ],
  exports: [
    GameSearchQueueService,
    IGDBService,
    IGDBCoordinationService,
    IGDBUpsertService,
  ],
})
export class IGDBModule {}
