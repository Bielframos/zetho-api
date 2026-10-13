import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { Games } from 'src/infra/appwrite/appwrite';
import { TranslatorService } from 'src/agents/translator/translator.service';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { IGDBService } from '../igdb/igdb.service';
import { IGDBUpsertService } from '../igdb/igdb-upsert.service';
import { GameModule } from './game.module';
import { GameService } from './game.service';
import { GameMediaService } from './game-media.service';
import { GameMigrationsService } from './game-migrations.service';
import { GameSubscriptionsService } from './game-subscriptions.service';

function fixture() {
  const tablesDB = {
    listRows: jest.fn(),
    getRow: jest.fn(),
    updateRow: jest.fn(),
    createTransaction: jest.fn().mockResolvedValue({ $id: 'tx' }),
    createOperations: jest.fn().mockResolvedValue({}),
    updateTransaction: jest.fn().mockResolvedValue({}),
  };
  const appwrite = {
    tablesDB,
    users: { listTargets: jest.fn(), get: jest.fn(), createTarget: jest.fn() },
    messaging: {
      getTopic: jest.fn(),
      createTopic: jest.fn(),
      createSubscriber: jest.fn(),
      deleteSubscriber: jest.fn(),
    },
  };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const igdb = {
    fetchGameMedias: jest.fn().mockResolvedValue({}),
    getGamesByIds: jest.fn(),
  };
  const translator = { translate: jest.fn() };
  return { appwrite, tablesDB, cache, igdb, translator };
}

describe('Game module responsibility boundaries', () => {
  it('registers all catalog collaborators with Nest using module providers', async () => {
    const f = fixture();
    const module = await Test.createTestingModule({
      providers: [
        ...Reflect.getMetadata('providers', GameModule),
        { provide: Appwrite, useValue: f.appwrite },
        { provide: CACHE_MANAGER, useValue: f.cache },
        { provide: IGDBService, useValue: f.igdb },
        { provide: TranslatorService, useValue: f.translator },
        { provide: IGDBUpsertService, useValue: {} },
        { provide: GENKIT, useValue: {} },
      ],
    }).compile();
    expect(module.get(GameService)).toBeInstanceOf(GameService);
    expect(module.get(GameMediaService)).toBeInstanceOf(GameMediaService);
    expect(module.get(GameMigrationsService)).toBeInstanceOf(
      GameMigrationsService,
    );
    expect(module.get(GameSubscriptionsService)).toBeInstanceOf(
      GameSubscriptionsService,
    );
    await module.close();
  });
});

describe('GameMigrationsService', () => {
  it('shares an in-flight migration per game and can retry after a failed transaction', async () => {
    const f = fixture();
    const service = new GameMigrationsService(
      f.appwrite as never,
      f.translator as never,
      f.igdb as never,
    );
    const failure = new Error('commit unavailable');
    f.tablesDB.updateTransaction.mockRejectedValueOnce(failure);
    const game = {
      $id: 'game-1',
      externalReference: 1,
      zethoVersion: 0,
    } as Games;
    const results = await Promise.allSettled([
      service.upgrade(game),
      service.upgrade({ ...game }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(f.igdb.fetchGameMedias).toHaveBeenCalledTimes(1);
    expect(f.tablesDB.updateTransaction).toHaveBeenLastCalledWith({
      transactionId: 'tx',
      rollback: true,
    });
    await service.upgrade(game);
    expect(f.igdb.fetchGameMedias).toHaveBeenCalledTimes(2);
  });

  it('does not query integrations or write for current catalog rows', async () => {
    const f = fixture();
    const service = new GameMigrationsService(
      f.appwrite as never,
      f.translator as never,
      f.igdb as never,
    );
    await service.upgrade({ $id: 'game-1', zethoVersion: 2 } as Games);
    expect(f.igdb.fetchGameMedias).not.toHaveBeenCalled();
    expect(f.translator.translate).not.toHaveBeenCalled();
    expect(f.tablesDB.createTransaction).not.toHaveBeenCalled();
  });

  it('keeps optional translation failure from breaking game reads', async () => {
    const f = fixture();
    f.translator.translate.mockRejectedValue(new Error('unconfigured'));
    const service = new GameMigrationsService(
      f.appwrite as never,
      f.translator as never,
      f.igdb as never,
    );
    await expect(
      service.upgrade({
        $id: 'game-1',
        zethoVersion: 1,
        summary: 'Summary',
      } as Games),
    ).resolves.toBeUndefined();
    expect(f.tablesDB.createTransaction).not.toHaveBeenCalled();
  });
});

describe('GameMediaService', () => {
  it('preserves separate hero and editorial image priorities and hero cache', async () => {
    const f = fixture();
    const media = [
      { type: 'screenshot', mediaId: 'screen' },
      { type: 'key_art', mediaId: 'art' },
    ];
    f.tablesDB.listRows
      .mockResolvedValueOnce({ rows: [{ $id: 'g1' }] })
      .mockResolvedValue({ rows: media });
    const service = new GameMediaService(
      f.appwrite as never,
      f.igdb as never,
      f.cache as never,
    );
    expect(await service.findHeroImageBySlug('game')).toEqual({
      url: 'https://images.igdb.com/igdb/image/upload/t_1080p/art.jpg',
      type: 'key_art',
    });
    expect(await service.getEditorialImage('g1')).toEqual({
      url: 'https://images.igdb.com/igdb/image/upload/t_screenshot_big/screen.jpg',
      type: 'screenshot',
    });
    expect(f.cache.set).toHaveBeenCalledWith(
      'game:hero:game',
      expect.objectContaining({ type: 'key_art' }),
    );
  });

  it('falls back to the cover for editorials but still rejects missing hero media', async () => {
    const f = fixture();
    f.tablesDB.listRows
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ coverUrl: 'https://example.org/cover.jpg' }],
      });
    const service = new GameMediaService(
      f.appwrite as never,
      f.igdb as never,
      f.cache as never,
    );
    expect(await service.getEditorialImage('g1')).toEqual({
      url: 'https://example.org/cover.jpg',
      type: 'cover',
    });
    f.tablesDB.listRows
      .mockResolvedValueOnce({ rows: [{ $id: 'g1' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(service.findHeroImageBySlug('game')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GameSubscriptionsService', () => {
  it('keeps deterministic subscriber IDs and accepts duplicate subscription/not-found unsubscription', async () => {
    const f = fixture();
    f.appwrite.users.listTargets.mockResolvedValue({
      targets: [{ $id: 'target', providerType: 'email' }],
    });
    f.appwrite.messaging.createSubscriber.mockRejectedValue({ code: 409 });
    f.appwrite.messaging.deleteSubscriber.mockRejectedValue({ code: 404 });
    const service = new GameSubscriptionsService(f.appwrite as never);
    await expect(
      service.setSubscription('user', 'game', true),
    ).resolves.toEqual({ success: true });
    await expect(
      service.setSubscription('user', 'game', false),
    ).resolves.toEqual({ success: true });
    const subscription = f.appwrite.messaging.createSubscriber.mock.calls[0][0];
    expect(f.appwrite.messaging.deleteSubscriber).toHaveBeenCalledWith({
      topicId: 'game_game',
      subscriberId: subscription.subscriberId,
    });
  });

  it('does not swallow messaging authorization errors', async () => {
    const f = fixture();
    f.appwrite.users.listTargets.mockResolvedValue({
      targets: [{ $id: 'target', providerType: 'email' }],
    });
    f.appwrite.messaging.getTopic.mockRejectedValue({ code: 403 });
    await expect(
      new GameSubscriptionsService(f.appwrite as never).setSubscription(
        'user',
        'game',
        true,
      ),
    ).rejects.toEqual({ code: 403 });
    expect(f.appwrite.messaging.createTopic).not.toHaveBeenCalled();
  });
});
