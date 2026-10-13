import { Test } from '@nestjs/testing';
import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';
import { GameRecommendationGeneratorService } from './game-recommendation-generator.service';
import { GameRecommendationReservationsService } from './game-recommendation-reservations.service';
import { GameRecommenderModule } from './game-recommender.module';
import { GameRecommenderService } from './game-recommender.service';

describe('GameRecommenderModule', () => {
  it('registers abandoned-reservation reconciliation once per minute', () => {
    const scheduledMethod =
      GameRecommenderService.prototype.reconcileAbandonedReservations;
    const reservationMethod =
      GameRecommendationReservationsService.prototype
        .reconcileAbandonedReservations;
    expect(
      Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, scheduledMethod),
    ).toMatchObject({
      cronTime: CronExpression.EVERY_MINUTE,
    });
    expect(
      Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, reservationMethod),
    ).toBeUndefined();
  });

  it('registers and injects the generation and reservation collaborators', async () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      GameRecommenderModule,
    );
    expect(providers).toContain(GameRecommendationGeneratorService);
    expect(providers).toContain(GameRecommendationReservationsService);

    const moduleRef = await Test.createTestingModule({
      providers: [
        GameRecommenderService,
        GameRecommendationGeneratorService,
        { provide: GENKIT, useValue: { generate: jest.fn() } },
        { provide: GameRecommenderCandidatesService, useValue: {} },
        { provide: Appwrite, useValue: { tablesDB: {} } },
        { provide: GameRecommendationReservationsService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(GameRecommenderService)).toBeInstanceOf(
      GameRecommenderService,
    );
    await moduleRef.close();
  });
});
