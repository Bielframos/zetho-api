import { GameSearchQueueService } from './game-search-queue.service';

describe('durable search queue', () => {
  let sequence: number;
  let rows: Map<string, any>;
  let transactions: Map<
    string,
    { operations: any[]; versions: Map<string, string | undefined> }
  >;
  let afterStage: ((operations: any[]) => void) | undefined;
  let db: any, igdb: any, service: GameSearchQueueService;
  const key = (table: string, id: string) => `${table}/${id}`;
  const put = (table: string, id: string, data: any) => {
    rows.set(key(table, id), {
      ...rows.get(key(table, id)),
      ...data,
      $id: id,
      $updatedAt: String(++sequence),
    });
  };
  beforeEach(() => {
    sequence = 0;
    rows = new Map();
    transactions = new Map();
    afterStage = undefined;
    put('games', 'igdb_1', {
      name: 'Grand Theft Auto',
      slug: 'grand-theft-auto',
      externalReference: 1,
      syncStage: 'basic',
    });
    put('game_search_jobs', 'igdb_1', {
      gameId: 'igdb_1',
      externalReference: 1,
      status: 'pending',
      availableAt: '2000-01-01',
      attempts: 0,
      leaseToken: '',
    });
    db = {
      listRows: jest.fn(async ({ tableId, queries = [] }) => {
        let found = [...rows.entries()]
          .filter(([k]) => k.startsWith(`${tableId}/`))
          .map(([, value]) => ({ ...value }));
        for (const query of queries.map(JSON.parse)) {
          if (query.method === 'equal')
            found = found.filter((row) =>
              query.values.includes(row[query.attribute]),
            );
          if (query.method === 'notEqual')
            found = found.filter(
              (row) => !query.values.includes(row[query.attribute]),
            );
          if (query.method === 'lessThanEqual')
            found = found.filter(
              (row) => row[query.attribute] <= query.values[0],
            );
          if (query.method === 'limit') found = found.slice(0, query.values[0]);
        }
        return { rows: found, total: found.length };
      }),
      createTransaction: jest.fn(async () => {
        const $id = `tx${++sequence}`;
        transactions.set($id, { operations: [], versions: new Map() });
        return { $id };
      }),
      createOperations: jest.fn(async ({ transactionId, operations }) => {
        const tx = transactions.get(transactionId)!;
        operations = operations.flatMap((op) =>
          op.action === 'bulkUpsert'
            ? op.data.map((row) => ({
                ...op,
                action: 'upsert',
                rowId: row.$id,
                data: row,
              }))
            : [op],
        );
        tx.operations = operations;
        for (const op of operations)
          tx.versions.set(
            key(op.tableId, op.rowId),
            rows.get(key(op.tableId, op.rowId))?.$updatedAt,
          );
        afterStage?.(operations);
      }),
      updateTransaction: jest.fn(async ({ transactionId, commit }) => {
        const tx = transactions.get(transactionId)!;
        if (!commit) {
          transactions.delete(transactionId);
          return;
        }
        if (
          [...tx.versions].some(
            ([k, version]) => rows.get(k)?.$updatedAt !== version,
          )
        )
          throw Object.assign(new Error('conflict'), { code: 409 });
        for (const op of tx.operations) put(op.tableId, op.rowId, op.data);
        transactions.delete(transactionId);
      }),
    };
    igdb = {
      getSearchGamesByIds: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Grand Theft Auto' }]),
    };
    service = new GameSearchQueueService({ tablesDB: db } as never, igdb);
  });
  it('commits basic data and job together with raw webhook IDs', async () => {
    await service.registerBasic({
      id: 2,
      name: 'Game',
      slug: 'game',
      cover: 42,
      involved_companies: [90],
      alternative_names: [50],
    });
    expect(rows.get('games/igdb_2')).toMatchObject({
      syncStage: 'basic',
      name: 'Game',
    });
    expect(rows.get('games/igdb_2')).not.toHaveProperty('coverUrl');
    expect(rows.get('game_search_jobs/igdb_2').status).toBe('pending');
    expect(igdb.getSearchGamesByIds).not.toHaveBeenCalled();
  });
  it('rolls back basic registration if durable enqueue fails', async () => {
    db.createOperations.mockRejectedValue(new Error('queue unavailable'));
    await expect(
      service.registerBasic({ id: 2, name: 'Game', slug: 'game' }),
    ).rejects.toThrow();
    expect(rows.has('games/igdb_2')).toBe(false);
    expect(db.updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ rollback: true }),
    );
  });
  it('preserves full records on another webhook', async () => {
    put('games', 'igdb_1', { syncStage: 'full', summaryPt: 'preserved' });
    await service.registerBasic({ id: 1, name: 'Game', slug: 'game' });
    expect(rows.get('games/igdb_1')).toMatchObject({
      name: 'Grand Theft Auto',
      syncStage: 'full',
      summaryPt: 'preserved',
    });
  });
  it('rejects a claim when another worker changed the job', async () => {
    afterStage = () => {
      afterStage = undefined;
      put('game_search_jobs', 'igdb_1', { leaseToken: 'other' });
    };
    expect(await service.processBatch()).toEqual({ processed: 0, failed: 0 });
    expect(igdb.getSearchGamesByIds).not.toHaveBeenCalled();
  });
  it('re-reads concurrently enriched full data instead of downgrading it', async () => {
    afterStage = (operations) => {
      if (operations.some((op) => op.tableId === 'games')) {
        afterStage = undefined;
        put('games', 'igdb_1', { syncStage: 'full', summaryPt: 'preserved' });
      }
    };
    expect(await service.processBatch()).toEqual({ processed: 1, failed: 0 });
    expect(rows.get('games/igdb_1')).toMatchObject({
      syncStage: 'full',
      summaryPt: 'preserved',
    });
    expect(db.updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ rollback: true }),
    );
  });
  it('retains failed IGDB jobs for retry without touching the game', async () => {
    igdb.getSearchGamesByIds.mockRejectedValue(new Error('unavailable'));
    expect(await service.processBatch()).toEqual({ processed: 0, failed: 1 });
    expect(rows.get('game_search_jobs/igdb_1')).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    expect(rows.get('games/igdb_1').syncStage).toBe('basic');
  });
  it('commits enrichment and acknowledgement together', async () => {
    expect(await service.processBatch()).toEqual({ processed: 1, failed: 0 });
    expect(rows.get('games/igdb_1')).toMatchObject({
      syncStage: 'search_ready',
      searchIndexVersion: 1,
    });
    expect(rows.get('game_search_jobs/igdb_1').status).toBe('done');
  });
  it('does not acknowledge a new webhook generation', async () => {
    afterStage = (operations) => {
      if (operations.some((op) => op.tableId === 'games')) {
        afterStage = undefined;
        put('game_search_jobs', 'igdb_1', {
          status: 'pending',
          leaseToken: '',
        });
      }
    };
    expect(await service.processBatch()).toEqual({ processed: 0, failed: 0 });
    expect(rows.get('game_search_jobs/igdb_1').status).toBe('pending');
    expect(rows.get('games/igdb_1').syncStage).toBe('basic');
  });
  it('indexes preserved local data when IGDB no longer returns the game', async () => {
    igdb.getSearchGamesByIds.mockResolvedValue([]);
    put('games', 'igdb_1', {
      coverUrl: 'existing',
      summaryPt: 'preserved',
      syncStage: 'full',
    });
    expect(await service.processBatch()).toEqual({ processed: 1, failed: 0 });
    expect(rows.get('games/igdb_1')).toMatchObject({
      coverUrl: 'existing',
      summaryPt: 'preserved',
      syncStage: 'full',
      searchIndexVersion: 1,
    });
    expect(rows.get('game_search_jobs/igdb_1')).toMatchObject({
      status: 'done',
      error: expect.stringContaining('source_missing:'),
    });
  });
});
