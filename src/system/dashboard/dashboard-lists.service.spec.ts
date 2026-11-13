import { DashboardListsService } from './dashboard-lists.service';
import { DashboardProfilesService } from './dashboard-profiles.service';

describe('DashboardListsService', () => {
  it('owns list like writes and queues the updated public list', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'list-1',
              isPublic: true,
              status: 'published',
              likeCount: 2,
              saveCount: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      createRow: jest.fn().mockResolvedValue({}),
      updateRow: jest
        .fn()
        .mockResolvedValue({
          $id: 'list-1',
          isPublic: true,
          status: 'published',
          likeCount: 3,
          saveCount: 0,
        }),
    };
    const outbox = { enqueueImmediate: jest.fn().mockResolvedValue(undefined) };
    const appwrite = { tablesDB };
    const service = new DashboardListsService(
      appwrite as any,
      outbox as any,
      new DashboardProfilesService(appwrite as any),
    );

    await expect(service.toggleListLike('user-1', 'list-1')).resolves.toEqual({
      listId: 'list-1',
      likedByMe: true,
      savedByMe: false,
      likeCount: 3,
      saveCount: 0,
    });
    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'list_likes' }),
    );
    expect(outbox.enqueueImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SOCIAL_TIMELINE',
        payload: expect.objectContaining({ table: 'lists', action: 'update' }),
      }),
    );
  });
});
