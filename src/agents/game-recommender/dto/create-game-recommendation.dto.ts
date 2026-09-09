import { IsIn, IsOptional } from 'class-validator';
import type { RecommendationScope } from '../game-recommender.types';

export class CreateGameRecommendationDto {
  @IsOptional()
  @IsIn(['any', 'library', 'new'])
  scope: RecommendationScope = 'any';
}
