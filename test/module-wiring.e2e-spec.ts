import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { OutboxService } from '../src/infra/events/outbox.service';
import { GENKIT, GENKIT_GOOGLE_AI } from '../src/infra/ai/ai.constants';
import { TimelineService } from '../src/system/dashboard/timeline.service';
import { IGDBCoordinationService } from '../src/modules/igdb/igdb-coordination.service';
import { GameService } from '../src/modules/game/game.service';
import { DashboardService } from '../src/system/dashboard/dashboard.service';
import { GameplaySessionsService } from '../src/modules/gameplay-sessions/gameplay-sessions.service';
import { GameRecommenderService } from '../src/agents/game-recommender/game-recommender.service';
import { EditorService } from '../src/agents/editor/editor.service';
import { ZethoHandler } from '../src/modules/webhook/handlers/zetho.handler';

describe('Application module graph', () => {
  it('resolves domain orchestrators through the real module imports without external connections', async () => {
    // Only infrastructure with network connections is substituted. Feature
    // registrations and their collaborator dependencies are the production ones.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Appwrite)
      .useValue({ tablesDB: {}, users: {}, messaging: {}, storage: {} })
      .overrideProvider(OutboxService)
      .useValue({ registerHandler: jest.fn() })
      .overrideProvider(TimelineService)
      .useValue({})
      .overrideProvider(IGDBCoordinationService)
      .useValue({})
      .overrideProvider(GENKIT)
      .useValue({ defineTool: jest.fn() })
      .overrideProvider(GENKIT_GOOGLE_AI)
      .useValue({ defineTool: jest.fn() })
      .compile();
    for (const service of [
      GameService,
      DashboardService,
      GameplaySessionsService,
      GameRecommenderService,
      EditorService,
      ZethoHandler,
    ]) {
      expect(module.get(service)).toBeInstanceOf(service);
    }
    await module.close();
  });
});
