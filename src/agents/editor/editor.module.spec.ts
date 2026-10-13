import { Test } from '@nestjs/testing';
import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CorrelationContextService } from 'src/common/observability/correlation-context.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { OutboxService } from 'src/infra/events/outbox.service';
import { GameService } from 'src/modules/game/game.service';
import { YoutubeService } from 'src/modules/google/youtube.service';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { EditorModule } from './editor.module';
import { ContentExtractorService } from './content-extractor.service';
import { EditorialImageService } from './editorial-image.service';
import { EditorService } from './editor.service';
import { EditorialPostService } from './editorial-post.service';

describe('EditorModule provider wiring', () => {
  it('resolves actual module providers and registers the outbox handler on init', async () => {
    const outbox = {
      registerHandler: jest.fn(),
      enqueueImmediate: jest.fn(),
    };
    const tablesDB = { listRows: jest.fn(), createRow: jest.fn() };
    const moduleProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      EditorModule,
    ) as Provider[];
    const module = await Test.createTestingModule({
      providers: [
        ...moduleProviders,
        {
          provide: GENKIT,
          useValue: { prompt: jest.fn(), defineTool: jest.fn() },
        },
        { provide: GameService, useValue: { search: jest.fn() } },
        { provide: YoutubeService, useValue: { searchVideos: jest.fn() } },
        {
          provide: CorrelationContextService,
          useValue: { runWithGeneratedCorrelationId: jest.fn() },
        },
        {
          provide: LoggerContextService,
          useValue: { trackLifecycle: jest.fn() },
        },
        { provide: Appwrite, useValue: { tablesDB } },
        { provide: OutboxService, useValue: outbox },
        {
          provide: NotificationsService,
          useValue: {
            sharePost: jest.fn(),
            sendGameSubscriberEmails: jest.fn(),
          },
        },
        { provide: ContentExtractorService, useValue: { extract: jest.fn() } },
        {
          provide: EditorialImageService,
          useValue: { forPublication: jest.fn() },
        },
      ],
    }).compile();

    await module.init();

    expect(module.get(EditorService)).toBeInstanceOf(EditorService);
    expect(module.get(EditorialPostService)).toBeInstanceOf(
      EditorialPostService,
    );
    expect(outbox.registerHandler).toHaveBeenCalledTimes(1);
    expect(outbox.registerHandler).toHaveBeenCalledWith(
      'editorial.post.published',
      expect.any(Function),
    );
    await module.close();
  });
});
