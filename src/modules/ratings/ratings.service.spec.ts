import { Query } from 'node-appwrite';
import { RatingsService } from './ratings.service';

describe('RatingsService achievement outbox', () => {
  it('reports an outbox failure after a persisted review deletion', async () => {
    const listRows = jest.fn().mockImplementation(({ tableId }) => {
      if (tableId === 'user_profiles')
        return Promise.resolve({
          rows: [{ $id: 'profile-1', fingerprint: 'fingerprint-1' }],
          total: 1,
        });
      if (tableId === 'ratings')
        return Promise.resolve({
          rows: [{ $id: 'rating-1', rating: 4 }],
          total: 1,
        });
      if (tableId === 'games') return Promise.resolve({ rows: [], total: 0 });
      throw new Error(tableId);
    });
    const deleteRow = jest.fn().mockResolvedValue({});
    const enqueueImmediate = jest
      .fn()
      .mockRejectedValue(new Error('outbox unavailable'));
    const createTransaction = jest.fn().mockResolvedValue({ $id: 'tx-1' });
    const updateTransaction = jest.fn().mockResolvedValue({});
    const service = new RatingsService(
      {
        tablesDB: { listRows, deleteRow, createTransaction, updateTransaction },
      } as any,
      {} as any,
      {
        enqueueImmediate,
        enqueue: jest.fn().mockRejectedValue(new Error('outbox unavailable')),
      } as any,
      { del: jest.fn() } as any,
    );

    await expect(service.deleteRating('user-1', 'game-1')).rejects.toThrow(
      'outbox unavailable',
    );
    expect(deleteRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'ratings', rowId: 'rating-1' }),
    );
    expect(updateTransaction).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      rollback: true,
    });
  });
});

describe('RatingsService.getRatingsFeed', () => {
  const createService = (listRows: jest.Mock) =>
    new RatingsService(
      { tablesDB: { listRows } } as any,
      {} as any,
      { enqueueImmediate: jest.fn() } as any,
      { del: jest.fn() } as any,
    );

  it('paginates deterministically and hydrates games and authors in batches', async () => {
    const ratings = [
      {
        $id: 'rating-1',
        $createdAt: '2026-08-18T12:00:00.000Z',
        gameId: 'game-1',
        ownerFingerprint: 'fingerprint-1',
        rating: 4.5,
      },
      {
        $id: 'rating-2',
        $createdAt: '2026-08-18T12:00:00.000Z',
        gameId: 'missing-game',
        ownerFingerprint: 'missing-author',
        rating: 3,
      },
    ];
    const listRows = jest.fn().mockImplementation(({ tableId }) => {
      if (tableId === 'ratings') {
        return Promise.resolve({ rows: ratings, total: 5 });
      }
      if (tableId === 'games') {
        return Promise.resolve({
          rows: [
            {
              $id: 'game-1',
              name: 'Jogo Um',
              slug: 'jogo-um',
              coverUrl: 'https://example.com/game-1.webp',
            },
          ],
          total: 1,
        });
      }
      return Promise.resolve({
        rows: [
          {
            $id: 'profile-1',
            fingerprint: 'fingerprint-1',
            gamertag: 'player-one',
            avatarUrl: 'https://example.com/avatar.webp',
          },
        ],
        total: 1,
      });
    });
    const service = createService(listRows);

    const result = await service.getRatingsFeed(2, 2);

    expect(listRows).toHaveBeenCalledTimes(3);
    expect(listRows).toHaveBeenNthCalledWith(1, {
      databaseId: 'app',
      tableId: 'ratings',
      queries: [
        Query.orderDesc('$createdAt'),
        Query.orderDesc('$id'),
        Query.limit(2),
        Query.offset(2),
      ],
    });

    const gameRequest = listRows.mock.calls.find(
      ([request]) => request.tableId === 'games',
    )?.[0];
    const profileRequest = listRows.mock.calls.find(
      ([request]) => request.tableId === 'user_profiles',
    )?.[0];
    expect(gameRequest).toEqual({
      databaseId: 'app',
      tableId: 'games',
      queries: [Query.equal('$id', ['game-1', 'missing-game']), Query.limit(2)],
    });
    expect(profileRequest).toEqual({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [
        Query.equal('fingerprint', ['fingerprint-1', 'missing-author']),
        Query.limit(2),
      ],
    });
    expect(result).toEqual({
      items: [
        {
          ...ratings[0],
          game: {
            $id: 'game-1',
            name: 'Jogo Um',
            slug: 'jogo-um',
            coverUrl: 'https://example.com/game-1.webp',
          },
          author: {
            $id: 'profile-1',
            gamertag: 'player-one',
            avatarUrl: 'https://example.com/avatar.webp',
          },
        },
        { ...ratings[1], game: null, author: null },
      ],
      total: 5,
      page: 2,
      pageSize: 2,
      totalPages: 3,
    });
  });

  it('bounds invalid pagination values before querying', async () => {
    const listRows = jest.fn().mockResolvedValue({ rows: [], total: 0 });
    const service = createService(listRows);

    const result = await service.getRatingsFeed(-4, 999);

    expect(listRows).toHaveBeenCalledWith({
      databaseId: 'app',
      tableId: 'ratings',
      queries: [
        Query.orderDesc('$createdAt'),
        Query.orderDesc('$id'),
        Query.limit(50),
        Query.offset(0),
      ],
    });
    expect(result).toMatchObject({ page: 1, pageSize: 50 });
  });

  it('returns empty metadata without issuing hydration queries', async () => {
    const listRows = jest.fn().mockResolvedValue({ rows: [], total: 0 });
    const service = createService(listRows);

    await expect(service.getRatingsFeed(3, 12)).resolves.toEqual({
      items: [],
      total: 0,
      page: 3,
      pageSize: 12,
      totalPages: 0,
    });
    expect(listRows).toHaveBeenCalledTimes(1);
  });
});
