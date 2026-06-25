import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const makeService = (tablesDB: any) =>
    new DashboardService({ tablesDB } as any);

  it('returns an empty feed when the user follows nobody', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
    };

    const service = makeService(tablesDB);

    await expect(service.getPersonalFeed('user-1')).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('creates a like relation and increments list like count', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'list-1', likeCount: 2, saveCount: 4 }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      createRow: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'list-1',
        likeCount: 3,
        saveCount: 4,
      }),
      deleteRow: jest.fn(),
    };

    const service = makeService(tablesDB);

    await expect(service.toggleListLike('user-1', 'list-1')).resolves.toEqual({
      listId: 'list-1',
      likedByMe: true,
      savedByMe: false,
      likeCount: 3,
      saveCount: 4,
    });
    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'list_likes',
        data: {
          listId: 'list-1',
          userId: 'user-1',
          profileId: 'profile-1',
        },
      }),
    );
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'lists',
        rowId: 'list-1',
        data: { likeCount: 3 },
      }),
    );
  });

  it('removes a like relation and never decrements below zero', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'list-1', likeCount: 0, saveCount: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'like-1', listId: 'list-1', userId: 'user-1' }],
          total: 1,
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      createRow: jest.fn(),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'list-1',
        likeCount: 0,
        saveCount: 1,
      }),
      deleteRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(service.toggleListLike('user-1', 'list-1')).resolves.toEqual({
      listId: 'list-1',
      likedByMe: false,
      savedByMe: false,
      likeCount: 0,
      saveCount: 1,
    });
    expect(tablesDB.deleteRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'list_likes',
        rowId: 'like-1',
      }),
    );
  });
});
