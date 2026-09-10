import { InternalServerErrorException } from '@nestjs/common';
import { CorrelationContextService } from 'src/common/observability/correlation-context.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { IGDBService } from './igdb.service';

type TablesDbMock = {
  listRows: jest.Mock;
  createRow: jest.Mock;
  createTransaction: jest.Mock;
  updateTransaction: jest.Mock;
  updateRow: jest.Mock;
  upsertRows: jest.Mock;
};

type AppwriteMock = {
  tablesDB: TablesDbMock;
};

describe('IGDBService outbound policy', () => {
  const appwriteMock: AppwriteMock = {
    tablesDB: {
      listRows: jest.fn(),
      createRow: jest.fn(),
      createTransaction: jest.fn(),
      updateTransaction: jest.fn(),
      updateRow: jest.fn(),
      upsertRows: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IGDB_CLIENT_ID = 'client-id';
    appwriteMock.tablesDB.listRows.mockResolvedValue({ rows: [] });
  });

  it('retries transient IGDB failure up to cap and succeeds', async () => {
    const correlationContext = new CorrelationContextService();
    const loggerContext = new LoggerContextService(correlationContext);
    const coordinationService = {
      applyRateLimit: jest.fn(),
      getCachedToken: jest.fn().mockResolvedValue('token'),
      cacheToken: jest.fn(),
    };
    const upsertService = {
      upsertGameRow: jest.fn(),
      ensureGameZStats: jest.fn(),
    };
    const service = new IGDBService(
      appwriteMock as never,
      correlationContext,
      loggerContext,
      coordinationService as never,
      upsertService as never,
    );
    (service as any).token = 'token';
    (service as any).tokenExpiry = new Date(Date.now() + 10 * 60_000);

    let attempts = 0;
    const fetchMock = jest.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response('temporary', { status: 503 });
      }
      return new Response(JSON.stringify([{ id: 1, name: 'Game' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await (service as any).fetchIgdb('games', 'fields id;');

    expect(attempts).toBe(3);
    expect(result).toEqual([{ id: 1, name: 'Game' }]);
  });

  it('fails fast on non-retryable 4xx integration response', async () => {
    const correlationContext = new CorrelationContextService();
    const loggerContext = new LoggerContextService(correlationContext);
    const coordinationService = {
      applyRateLimit: jest.fn(),
      getCachedToken: jest.fn().mockResolvedValue('token'),
      cacheToken: jest.fn(),
    };
    const upsertService = {
      upsertGameRow: jest.fn(),
      ensureGameZStats: jest.fn(),
    };
    const service = new IGDBService(
      appwriteMock as never,
      correlationContext,
      loggerContext,
      coordinationService as never,
      upsertService as never,
    );
    (service as any).token = 'token';
    (service as any).tokenExpiry = new Date(Date.now() + 10 * 60_000);

    const fetchMock = jest.fn(
      async () => new Response('bad request', { status: 400 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      (service as any).fetchIgdb('games', 'fields id;'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fully imports a basic game even when the IGDB checksum is unchanged', async () => {
    const correlation = new CorrelationContextService();
    const upsert = {
      upsertGameRow: jest.fn().mockResolvedValue('igdb_1'),
      ensureGameZStats: jest.fn(),
    };
    const service = new IGDBService(
      appwriteMock as never,
      correlation,
      new LoggerContextService(correlation),
      {} as never,
      upsert as never,
    );
    jest
      .spyOn(service, 'getGamesByIds')
      .mockResolvedValue([
        { id: 1, name: 'Game', slug: 'game', checksum: 'same' },
      ]);
    appwriteMock.tablesDB.listRows.mockResolvedValue({
      rows: [
        {
          $id: 'igdb_1',
          checksum: 'same',
          syncStage: 'basic',
          involvedCompanies: [],
        },
      ],
    });
    await service.importGameById(1);
    expect(upsert.upsertGameRow).toHaveBeenCalledWith(
      expect.objectContaining({ syncStage: 'full' }),
    );
  });
});
