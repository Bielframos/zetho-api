import 'reflect-metadata';
import { CacheModule } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { EventsModule } from 'src/infra/events/events.module';
import { OutboxService } from 'src/infra/events/outbox.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { GameplaySessionNotificationsService } from './gameplay-session-notifications.service';
import { GameplaySessionQueriesService } from './gameplay-session-queries.service';
import { GameplaySessionsModule } from './gameplay-sessions.module';
import { GameplaySessionsService } from './gameplay-sessions.service';

describe('Gameplay session collaborator wiring', () => {
  it('injects query and notification collaborators through the feature module', async () => {
    const appwrite = { tablesDB: {}, messaging: {} };
    const module = await Test.createTestingModule({
      imports: [
        CacheModule.register({ isGlobal: true }),
        EventsModule,
        GameplaySessionsModule,
      ],
    })
      .overrideProvider(Appwrite)
      .useValue(appwrite)
      .overrideProvider(TransactionService)
      .useValue({ runInTransaction: jest.fn() })
      .overrideProvider(OutboxService)
      .useValue({ enqueueImmediate: jest.fn() })
      .compile();

    const service = module.get(GameplaySessionsService);
    expect(service).toBeInstanceOf(GameplaySessionsService);
    expect(service['queries']).toBe(module.get(GameplaySessionQueriesService));
    expect(service['sessionNotifications']).toBe(
      module.get(GameplaySessionNotificationsService),
    );
    expect(module.get(GameplaySessionQueriesService)).toBeInstanceOf(
      GameplaySessionQueriesService,
    );
    await module.close();
  });
});
