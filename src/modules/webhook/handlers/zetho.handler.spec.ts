import { ZethoHandler } from './zetho.handler';

const READ_MODEL_COLUMNS = [
  'gameId',
  'ownerFingerprint',
  'status',
  'liked',
  'hyped',
  'likedEver',
  'maxStatusReached',
];

const makeHandler = (tablesDB: any) => {
  const loggerContext = {
    trackLifecycle: jest.fn((_logger, _context, run) => run()),
  };

  return new ZethoHandler({ tablesDB } as any, loggerContext as any, {} as any);
};

const makeTablesDB = (readEntry: any) => ({
  listRows: jest.fn().mockResolvedValue({
    rows: [
      {
        $id: 'profile-1',
        userId: 'user-1',
        zcoinBalance: 100,
        totalsPlaying: 1,
        totalsCompleted: 0,
      },
    ],
    total: 1,
  }),
  getRow: jest.fn(({ tableId }: { tableId: string }) => {
    if (tableId === 'z_entries_read') return Promise.resolve(readEntry);
    if (tableId === 'z_entry_count')
      return Promise.resolve({
        $id: 'zstats_igdb_1',
        playingCount: 5,
        completedCount: 2,
        likes: 3,
        hypedCount: 1,
      });
    return Promise.reject(new Error(`unexpected table ${tableId}`));
  }),
  createTransaction: jest.fn().mockResolvedValue({ $id: 'tx-1' }),
  upsertRow: jest.fn().mockResolvedValue({}),
  createOperations: jest.fn().mockResolvedValue({}),
  createRow: jest.fn().mockResolvedValue({}),
  updateTransaction: jest.fn().mockResolvedValue({}),
});

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  $id: 'entry-1',
  $sequence: 1,
  $tableId: 'z_entries',
  $databaseId: 'app',
  $createdAt: '2026-08-09T05:43:37.519+00:00',
  $updatedAt: '2026-08-09T05:43:37.519+00:00',
  $permissions: [],
  gameId: 'igdb_1',
  ownerFingerprint: 'fingerprint-1',
  status: 'completed',
  liked: true,
  hyped: false,
  processedAt: null,
  likeCount: 4,
  commentCount: 2,
  ...overrides,
});

describe('ZethoHandler.syncEntry', () => {
  it('projeta apenas as colunas existentes em z_entries_read', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'playing',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'playing',
    });

    const result = await makeHandler(tablesDB).syncEntry(makeEntry() as any);

    expect(result.success).toBe(true);
    expect(tablesDB.upsertRow).toHaveBeenCalledTimes(1);

    const { data } = tablesDB.upsertRow.mock.calls[0][0];

    // regressão: likeCount/commentCount/processedAt e campos $* derrubavam o
    // commit da transação com `document_invalid_structure`
    expect(Object.keys(data).sort()).toEqual([...READ_MODEL_COLUMNS].sort());
    expect(data).toMatchObject({
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'completed',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'completed',
    });
    expect(tablesDB.updateTransaction).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      commit: true,
    });
  });

  it('não vaza colunas novas de z_entries para o read model', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'playing',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'playing',
    });

    await makeHandler(tablesDB).syncEntry(
      makeEntry({ someFutureColumn: 'x' }) as any,
    );

    const { data } = tablesDB.upsertRow.mock.calls[0][0];
    expect(data).not.toHaveProperty('someFutureColumn');
    expect(data).not.toHaveProperty('processedAt');
    expect(data).not.toHaveProperty('likeCount');
    expect(data).not.toHaveProperty('commentCount');
  });

  it('mantém maxStatusReached quando o novo status é inferior', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'completed',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'completed',
    });

    await makeHandler(tablesDB).syncEntry(
      makeEntry({ status: 'dropped' }) as any,
    );

    const { data } = tablesDB.upsertRow.mock.calls[0][0];
    expect(data.status).toBe('dropped');
    expect(data.maxStatusReached).toBe('completed');
  });
});
