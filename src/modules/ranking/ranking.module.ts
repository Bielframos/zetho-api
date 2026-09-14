import { Module } from '@nestjs/common';
import { AppwriteModule } from 'src/infra/appwrite/appwrite.module';
import { ObservabilityModule } from 'src/common/observability/observability.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';

@Module({
  imports: [AppwriteModule, ObservabilityModule],
  controllers: [RankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
