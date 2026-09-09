import { Module } from '@nestjs/common';
import { AiModule } from 'src/infra/ai/ai.module';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';
import { GameRecommenderController } from './game-recommender.controller';
import { GameRecommenderService } from './game-recommender.service';

@Module({
  imports: [AiModule],
  controllers: [GameRecommenderController],
  providers: [GameRecommenderCandidatesService, GameRecommenderService],
  exports: [GameRecommenderService],
})
export class GameRecommenderModule {}
