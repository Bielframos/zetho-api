/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { GameRecommenderService } from './game-recommender.service';
import { createHash } from 'crypto';

// Transactional store double: independent snapshots, unique daily/idempotency keys,
// atomic commit/rollback and optimistic write conflicts. No production data is used.
function setup(initialBalance = 100) {
  let balance = initialBalance;
  let revision = 0;
  let sequence = 0;
  let rows: any[] = [];
  const transactions = new Map<
    string,
    { balance: number; rows: any[]; revision: number }
  >();
  const conflict = () => Object.assign(new Error('conflict'), { code: 409 });
  const state = (id?: string) =>
    id ? transactions.get(id)! : { balance, rows, revision };
  const matches = (row: any, query: any): boolean => {
    const value = row[query.attribute];
    const values = query.values ?? [];
    switch (query.method) {
      case 'equal':
        return values.includes(value);
      case 'isNull':
        return value == null;
      case 'greaterThanEqual':
        return value >= values[0];
      case 'lessThan':
        return value < values[0];
      case 'or':
        return values.some((q: any) =>
          matches(row, typeof q === 'string' ? JSON.parse(q) : q),
        );
      case 'and':
        return values.every((q: any) =>
          matches(row, typeof q === 'string' ? JSON.parse(q) : q),
        );
      default:
        return true;
    }
  };
  const db = {
    listRows: jest.fn(async ({ tableId, queries = [] }: any) => {
      if (tableId === 'user_profiles')
        return { rows: [{ $id: 'profile', userId: 'user' }] };
      let result = rows.filter((row) =>
        queries.every((q: string) => matches(row, JSON.parse(q))),
      );
      const limit = queries
        .map((q: string) => JSON.parse(q))
        .find((q: any) => q.method === 'limit');
      if (limit) result = result.slice(0, limit.values[0]);
      return { rows: structuredClone(result), total: result.length };
    }),
    getRow: jest.fn(async ({ tableId, rowId, transactionId }: any) => {
      const current = state(transactionId);
      return tableId === 'user_profiles'
        ? { $id: 'profile', zcoinBalance: current.balance }
        : structuredClone(current.rows.find((row) => row.$id === rowId));
    }),
    decrementRowColumn: jest.fn(async ({ transactionId, value, min }: any) => {
      const current = state(transactionId);
      if (current.balance - value < min) throw new Error('minimum balance');
      current.balance -= value;
      return {};
    }),
    createOperations: jest.fn(async ({ transactionId, operations }: any) => {
      const current = state(transactionId);
      for (const op of operations) current.balance += op.data.value;
    }),
    createRow: jest.fn(async ({ tableId, rowId, data, transactionId }: any) => {
      const current = state(transactionId);
      if (tableId !== 'game_recommendations') return {};
      if (
        current.rows.some(
          (row) =>
            row.$id === rowId ||
            (data.dailyKey && row.dailyKey === data.dailyKey),
        )
      )
        throw conflict();
      const row = { ...data, $id: rowId, $createdAt: new Date().toISOString() };
      current.rows.push(row);
      return row;
    }),
    updateRow: jest.fn(async ({ rowId, data, transactionId }: any) => {
      const current = state(transactionId);
      const row = current.rows.find((row) => row.$id === rowId);
      Object.assign(row, data);
      if (!transactionId) revision++;
      return structuredClone(row);
    }),
  };
  const tx = {
    runInTransaction: async (work: (ctx: { txId: string }) => Promise<any>) => {
      const id = `tx-${sequence++}`;
      const snapshot = { rows: structuredClone(rows), balance, revision };
      transactions.set(id, snapshot);
      try {
        const result = await work({ txId: id });
        if (revision !== snapshot.revision) throw conflict();
        rows = snapshot.rows;
        balance = snapshot.balance;
        revision++;
        return result;
      } finally {
        transactions.delete(id);
      }
    },
  };
  const game = {
    id: 'game',
    name: 'Game',
    slug: 'game',
    genres: [],
    coverUrl: null,
    releaseYear: '2026',
    ratingAvg: 4,
  };
  const ai = {
    generate: jest.fn(async () => ({
      output: {
        gameId: 'game',
        reason: 'Uma aventura divertida para explorar.',
        matchSignals: ['Exploração', 'Aventura'],
      },
    })),
  };
  const candidates = {
    build: jest.fn(async () => ({
      profile: { id: 'profile', userId: 'user', fingerprint: 'fp', balance },
      signals: [],
      candidates: [{ game, source: 'new', score: 1, basedOnGameIds: [] }],
    })),
    getGamesByIds: jest.fn(async () => [game]),
  };
  const service = new GameRecommenderService(
    ai as never,
    candidates as never,
    { tablesDB: db } as never,
    tx as never,
  );
  return {
    service,
    ai,
    candidates,
    db,
    balance: () => balance,
    rows: () => rows,
    seed: (row: any) => rows.push(row),
  };
}

describe('daily recommendation quota', () => {
  afterEach(() => jest.useRealTimers());

  it('allows five sequential uses across scopes, rejects sixth without AI or debit', async () => {
    const f = setup();
    for (let i = 0; i < 5; i++) {
      const result = await f.service.suggest(
        'user',
        i % 2 ? 'library' : 'new',
        `key-${i}`,
      );
      expect(result.cost).toBe(5);
      expect(result.quota?.remaining).toBe(4 - i);
    }
    await expect(
      f.service.suggest('user', 'any', 'sixth'),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.balance()).toBe(75);
    expect(f.ai.generate).toHaveBeenCalledTimes(5);
  });

  it('charges exactly five with exact balance and never overdraws with concurrent requests', async () => {
    const f = setup(5);
    const results = await Promise.allSettled([
      f.service.suggest('user', 'new', 'a'),
      f.service.suggest('user', 'new', 'b'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(f.balance()).toBe(0);
    expect(f.rows().filter((row) => row.state !== 'failed')).toHaveLength(1);
    expect(f.db.decrementRowColumn).toHaveBeenCalledWith(
      expect.objectContaining({ min: 0, value: 5 }),
    );
  });

  it('never reserves more than five slots under a concurrent burst', async () => {
    const f = setup();
    await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        f.service.suggest('user', 'new', `burst-${i}`),
      ),
    );
    expect(
      f.rows().filter((row) => row.state !== 'failed').length,
    ).toBeLessThanOrEqual(5);
    expect(f.balance()).toBeGreaterThanOrEqual(75);
    expect(
      new Set(
        f
          .rows()
          .filter((row) => row.dailyKey)
          .map((row) => row.dailyKey),
      ).size,
    ).toBe(f.rows().filter((row) => row.dailyKey).length);
  });

  it('replays one completed request without spending a second slot or changing historical price', async () => {
    const f = setup();
    const first = await f.service.suggest('user', 'new', 'same');
    f.rows()[0].cost = 10;
    const replay = await f.service.suggest('user', 'new', 'same');
    expect(replay.id).toBe(first.id);
    expect(replay.cost).toBe(10);
    expect(replay.quota?.remaining).toBe(4);
    expect(f.balance()).toBe(95);
    expect(f.ai.generate).toHaveBeenCalledTimes(1);
  });

  it('refunds a failed generation and releases its slot', async () => {
    const f = setup(5);
    f.ai.generate.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(
      f.service.suggest('user', 'new', 'failed'),
    ).rejects.toMatchObject({ status: 502 });
    expect(f.balance()).toBe(5);
    expect((await f.service.quota('user')).remaining).toBe(5);
    await expect(
      f.service.suggest('user', 'new', 'retry-new'),
    ).resolves.toMatchObject({ cost: 5, balance: 0 });
  });

  it('counts old dailyKey and keyless records on rollout without repricing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T15:00:00Z'));
    const f = setup();
    const dailyKey = `gday_${createHash('sha256').update('user:2026-10-11').digest('hex').slice(0, 31)}`;
    for (const [i, key] of [dailyKey, null].entries())
      f.seed({
        $id: `old-${i}`,
        userId: 'user',
        state: 'completed',
        cost: 10,
        dailyKey: key,
        $createdAt: new Date().toISOString(),
      });
    expect((await f.service.quota('user')).remaining).toBe(3);
    for (let i = 0; i < 3; i++)
      await f.service.suggest('user', 'new', `new-${i}`);
    await expect(
      f.service.suggest('user', 'new', 'sixth'),
    ).rejects.toMatchObject({ status: 429 });
    expect(
      f
        .rows()
        .slice(0, 2)
        .map((row) => row.cost),
    ).toEqual([10, 10]);
  });

  it('resets at Sao Paulo midnight even when candidate lookup crosses the boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T02:59:59Z'));
    const f = setup();
    await f.service.suggest('user', 'new', 'yesterday');
    const build = f.candidates.build.getMockImplementation()!;
    f.candidates.build.mockImplementation(async () => {
      jest.setSystemTime(new Date('2026-10-12T03:00:01Z'));
      return build();
    });
    await f.service.suggest('user', 'new', 'today');
    expect((await f.service.quota('user')).remaining).toBe(4);
    expect((await f.service.quota('user')).nextAvailableAt).toBe(
      '2026-10-13T03:00:00.000Z',
    );
  });

  it('reconciles abandoned reservations once and frees their slot', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T15:00:00Z'));
    const f = setup(0);
    f.seed({
      $id: 'abandoned',
      userId: 'user',
      state: 'pending',
      cost: 5,
      dailyKey: null,
      refunded: false,
      $createdAt: '2026-10-11T14:00:00Z',
    });
    expect(await f.service.reconcileAbandonedReservations()).toBe(1);
    expect(await f.service.reconcileAbandonedReservations()).toBe(0);
    expect(f.balance()).toBe(5);
    expect((await f.service.quota('user')).remaining).toBe(5);
  });
});
