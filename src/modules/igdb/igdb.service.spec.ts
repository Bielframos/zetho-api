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
    const service = new IGDBService(
      appwriteMock as never,
      correlationContext,
      loggerContext,
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
    const service = new IGDBService(
      appwriteMock as never,
      correlationContext,
      loggerContext,
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
});
