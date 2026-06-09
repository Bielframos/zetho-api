import { Logger } from '@nestjs/common';
import { CorrelationContextService } from '../../src/common/observability/correlation-context.service';
import { LoggerContextService } from '../../src/common/observability/logger-context.service';
import { EditorService } from '../../src/common/ai/agents/editor/editor.service';
import { IGDBService } from '../../src/modules/igdb/igdb.service';
import { RaffleService } from '../../src/modules/raffle/raffle.service';
import { ZCoinsService } from '../../src/modules/zcoins/zcoins.service';

const payloadsFrom = (spy: jest.SpiedFunction<typeof Logger.prototype.log>) =>
  spy.mock.calls
    .map(([payload]) => payload)
    .filter(
      (payload): payload is Record<string, unknown> =>
        typeof payload === 'object' && payload !== null,
    );

const errorsFrom = (spy: jest.SpiedFunction<typeof Logger.prototype.error>) =>
  spy.mock.calls
    .map(([payload]) => payload)
    .filter(
      (payload): payload is Record<string, unknown> =>
        typeof payload === 'object' && payload !== null,
    );

describe('Pipeline observability contract', () => {
  let correlationContext: CorrelationContextService;
  let loggerContext: LoggerContextService;
  let igdbService: IGDBService;
  let editorService: EditorService;
  let raffleService: RaffleService;
  let zCoinsService: ZCoinsService;
  let logSpy: jest.SpiedFunction<typeof Logger.prototype.log>;
  let errorSpy: jest.SpiedFunction<typeof Logger.prototype.error>;
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>;
  let debugSpy: jest.SpiedFunction<typeof Logger.prototype.debug>;

  beforeEach(() => {
    correlationContext = new CorrelationContextService();
    loggerContext = new LoggerContextService(correlationContext);

    const mockAppwrite = {
      tablesDB: {
        createRow: jest.fn(),
        listRows: jest.fn(),
        getRow: jest.fn(),
        createTransaction: jest.fn(),
        createOperations: jest.fn(),
        updateTransaction: jest.fn(),
        updateRow: jest.fn(),
        upsertRow: jest.fn(),
        createRows: jest.fn(),
        deleteRow: jest.fn(),
        upsertRows: jest.fn(),
      },
      users: {},
    } as any;

    const cache = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    const coordinationService = { applyRateLimit: jest.fn(), getCachedToken: jest.fn(), cacheToken: jest.fn() };
    const upsertService = { upsertGameRow: jest.fn(), ensureGameZStats: jest.fn() };

    igdbService = new IGDBService(
      mockAppwrite,
      correlationContext,
      loggerContext,
      coordinationService as any,
      upsertService as any,
    );
    editorService = new EditorService(
      { prompt: jest.fn(), defineTool: jest.fn() } as any,
      {} as any,
      mockAppwrite,
      { searchVideos: jest.fn() } as any,
      { sharePost: jest.fn() } as any,
      correlationContext,
      loggerContext,
      {} as any,
      { enqueueImmediate: jest.fn() } as any,
    );
    const mockTransactionService = {
      runInTransaction: jest.fn(async (work) => work({ txId: 'mock-tx-id' })),
    };
    raffleService = new RaffleService(
      mockAppwrite,
      loggerContext,
      mockTransactionService as any,
    );
    zCoinsService = new ZCoinsService(
      cache,
      mockAppwrite,
      loggerContext,
      mockTransactionService as any,
    );

    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined as never);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined as never);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as never);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('emits a full lifecycle envelope for IGDB sync success', async () => {
    jest
      .spyOn(igdbService as any, 'fetchIgdb')
      .mockResolvedValue([{ id: 1, name: 'Game One', checksum: 'abc' }]);
    jest.spyOn(igdbService as any, 'shouldIgnore').mockReturnValue(false);
    jest
      .spyOn(igdbService as any, 'getExistingGamesByExternalReference')
      .mockResolvedValue(new Map());
    jest.spyOn(igdbService as any, 'mapWithConcurrency').mockResolvedValue([
      {
        id: 1,
        name: 'Game One',
        gameId: 'igdb_1',
        skippedByChecksum: false,
      },
    ]);

    const result = await igdbService.syncPopularGames();

    expect(result).toMatchObject({
      success: true,
      message: 'Jogos populares sincronizados com sucesso',
    });

    const logs = payloadsFrom(logSpy);
    expect(
      logs.find(
        (entry) =>
          entry.component === 'IGDBService' &&
          entry.operation === 'igdb.sync-popular-games' &&
          entry.outcome === 'start',
      ),
    ).toMatchObject({
      correlationId: expect.any(String),
      component: 'IGDBService',
      operation: 'igdb.sync-popular-games',
      outcome: 'start',
    });

    expect(
      logs.find(
        (entry) =>
          entry.component === 'IGDBService' &&
          entry.operation === 'igdb.sync-popular-games' &&
          entry.outcome === 'success',
      ),
    ).toMatchObject({
      correlationId: expect.any(String),
      durationMs: expect.any(Number),
      outcome: 'success',
    });
  });

  it('generates a cron correlation id for editor runs', async () => {
    jest.spyOn(editorService, 'execute').mockResolvedValue({
      skipped: true,
      reason: 'already published',
    } as never);

    const result = await editorService.handleScheduledExecution();

    expect(result).toMatchObject({
      skipped: true,
      reason: 'already published',
    });

    const logs = payloadsFrom(logSpy);
    const startLog = logs.find(
      (entry) =>
        entry.component === 'EditorService' &&
        entry.operation === 'editor.cron' &&
        entry.outcome === 'start',
    );
    const successLog = logs.find(
      (entry) =>
        entry.component === 'EditorService' &&
        entry.operation === 'editor.cron' &&
        entry.outcome === 'success',
    );

    expect(startLog).toMatchObject({
      correlationId: expect.any(String),
      outcome: 'start',
    });
    expect(successLog).toMatchObject({
      correlationId: startLog?.correlationId,
      durationMs: expect.any(Number),
      outcome: 'success',
    });
  });

  it('emits structured lifecycle logs for raffle mutations', async () => {
    (raffleService as any).tablesDB.createRow.mockResolvedValue({
      $id: 'raffle-1',
    });

    const result = await correlationContext.runWithGeneratedCorrelationId(() =>
      raffleService.createRaffle({
        gameId: 'game-1',
        rewardPolicy: 'one_key',
        basicProbability: 100,
        ticketPrice: 20,
      }),
    );

    expect(result).toMatchObject({ $id: 'raffle-1' });

    const logs = payloadsFrom(logSpy);
    expect(
      logs.find(
        (entry) =>
          entry.component === 'RaffleService' &&
          entry.operation === 'raffle.create' &&
          entry.outcome === 'success',
      ),
    ).toMatchObject({
      correlationId: expect.any(String),
      durationMs: expect.any(Number),
      outcome: 'success',
    });
  });

  it('emits structured error logs for failed zcoin mutations', async () => {
    await correlationContext.runWithGeneratedCorrelationId(async () => {
      await expect(
        zCoinsService.applyOutput('user-1', 'raffle'),
      ).rejects.toThrow('reason inválido');
    });

    const logs = errorsFrom(errorSpy);
    expect(
      logs.find(
        (entry) =>
          entry.component === 'ZCoinsService' &&
          entry.operation === 'zcoins.output' &&
          entry.outcome === 'error',
      ),
    ).toMatchObject({
      correlationId: expect.any(String),
      durationMs: expect.any(Number),
      outcome: 'error',
    });
  });
});
