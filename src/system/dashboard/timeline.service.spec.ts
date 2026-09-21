import { TimelineService } from './timeline.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    multi: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    disconnect: jest.fn(),
  }));
});

describe('TimelineService', () => {
  it('keeps the newest status for one game even when backfill reaches older rows later', async () => {
    const upsertRow = jest.fn().mockResolvedValue({});
    const tablesDB = {
      listRows: jest.fn().mockResolvedValue({ rows: [{ $id: 'actor' }] }),
      getRow: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        occurredAt: '2026-02-01T00:00:00.000Z',
        sourceId: 'new',
      }),
      upsertRow,
    };
    const service = new TimelineService({ tablesDB } as any);
    const base = {
      ownerFingerprint: 'fingerprint',
      gameId: 'game',
      status: 'completed',
    };
    await service.ingest(
      'z_entries',
      { ...base, $id: 'new', $createdAt: '2026-02-01T00:00:00.000Z' },
      'create',
      'user',
    );
    await service.ingest(
      'z_entries',
      { ...base, $id: 'old', $createdAt: '2026-01-01T00:00:00.000Z' },
      'create',
      'user',
    );
    expect(upsertRow).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('hides previously projected activity after an unfollow', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'event',
              recipientUserId: 'user',
              actorProfileId: 'actor',
              sourceType: 'rating',
              sourceId: 'rating',
              occurredAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ $id: 'actor', gamertag: 'A' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new TimelineService({ tablesDB } as any);
    const result = await service.page('user', 'recipient', 1, 12);
    expect(result.items).toEqual([]);
    await service.onModuleDestroy();
  });

  it('restores historical list items for each recipient missing the public list', async () => {
    const upsertRow = jest.fn().mockResolvedValue({});
    const tablesDB = {
      listRows: jest.fn(async ({ tableId }: { tableId: string }) => {
        if (tableId === 'connections')
          return {
            rows: [
              { $id: 'connection-1', requesterProfileId: 'profile-1' },
              { $id: 'connection-2', requesterProfileId: 'profile-2' },
            ],
          };
        if (tableId === 'user_profiles')
          return {
            rows: [
              { $id: 'actor', fingerprint: 'actor-fingerprint' },
              { $id: 'profile-1', userId: 'user-1' },
              { $id: 'profile-2', userId: 'user-2' },
            ],
          };
        if (tableId === 'list_items')
          return {
            rows: [
              {
                $id: 'item-1',
                $createdAt: '2026-01-01T00:00:00.000Z',
                list: 'list-1',
              },
            ],
          };
        return { rows: [] };
      }),
      getRow: jest.fn(
        async ({ tableId, rowId }: { tableId: string; rowId: string }) => {
          if (tableId === 'lists')
            return {
              $id: 'list-1',
              isPublic: true,
              ownerFingerprint: 'actor-fingerprint',
            };
          if (tableId === 'feed_events' && rowId) {
            if (
              tablesDB.getRow.mock.calls.filter(
                ([call]) => call.tableId === 'feed_events',
              ).length === 1
            )
              return { $id: rowId };
            throw new Error('Row not found');
          }
          throw new Error('Unexpected row lookup');
        },
      ),
      upsertRow,
    };
    const service = new TimelineService({ tablesDB } as any);
    await service.ingest(
      'lists',
      {
        $id: 'list-1',
        $createdAt: '2026-01-01T00:00:00.000Z',
        ownerFingerprint: 'actor-fingerprint',
        isPublic: true,
      },
      'update',
    );
    expect(
      upsertRow.mock.calls
        .filter(([call]) => call.data.sourceType === 'list_item')
        .map(([call]) => call.data.recipientUserId),
    ).toEqual(['user-2']);
    await service.onModuleDestroy();
  });
});
