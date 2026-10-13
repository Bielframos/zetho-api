import { Module } from '@nestjs/common';
import { AiModule } from 'src/infra/ai/ai.module';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';
import { GameRecommenderController } from './game-recommender.controller';
import { GameRecommenderService } from './game-recommender.service';
import { GameRecommendationGeneratorService } from './game-recommendation-generator.service';
import { GameRecommendationReservationsService } from './game-recommendation-reservations.service';

@Module({
  imports: [AiModule],
  controllers: [GameRecommenderController],
  providers: [
    GameRecommenderCandidatesService,
    GameRecommendationGeneratorService,
    GameRecommendationReservationsService,
    GameRecommenderService,
  ],
  exports: [GameRecommenderService],
})
export class GameRecommenderModule {}
