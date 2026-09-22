import { ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';

describe('SocialService writes', () => {
  const make = (
    tablesDB: any,
    outbox: any = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      processOutbox: jest.fn().mockResolvedValue(undefined),
    },
  ) => {
    const tx = { runInTransaction: async (fn: any) => fn({ txId: 'tx-1' }) };
    return {
      service: new SocialService(
        { tablesDB } as any,
        tx as any,
        outbox as any,
        { invalidate: jest.fn() } as any,
      ),
      outbox,
    };
  };
  it('retains prior entry fields and toggles the selected status off', async () => {
    const createRow = jest
      .fn()
      .mockImplementation(async ({ data }) => ({ $id: 'entry-1', ...data }));
    const listRows = jest.fn().mockImplementation(async ({ tableId }) => ({
      rows:
        tableId === 'user_profiles'
          ? [{ $id: 'p1', fingerprint: 'f1' }]
          : [
              {
                status: 'completed',
                liked: true,
                hyped: false,
                playedPlatform: 'PC/Steam',
                completionType: 'Campanha Principal',
                playtimeMinutes: 60,
              },
            ],
    }));
    const { service, outbox } = make({ listRows, createRow });
    await service.createEntry('u1', { gameId: 'g1', status: 'completed' });
    expect(createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entries',
        data: expect.objectContaining({
          ownerFingerprint: 'f1',
          liked: true,
          playedPlatform: 'PC/Steam',
          completionType: null,
          playtimeMinutes: 60,
        }),
      }),
    );
    expect(createRow.mock.calls[0][0].data.status).toBeUndefined();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ type: 'SOCIAL_ENTRY_SYNC' }),
    );
  });
  it('validates a catalog platform and preserves its ID through status changes', async () => {
    const createRow = jest.fn().mockImplementation(async ({ data }) => ({ $id: 'entry', ...data }));
    const getRow = jest.fn().mockResolvedValue({ $id: 'ps3', name: 'PlayStation 3' });
    const listRows = jest.fn().mockImplementation(async ({ tableId }) => ({ rows: tableId === 'user_profiles'
      ? [{ $id: 'p1', fingerprint: 'f1' }] : [{ status: 'playing', playedPlatformId: 'ps3', playedPlatform: null }] }));
    const { service } = make({ createRow, getRow, listRows });
    await service.createEntry('u1', { gameId: 'g1', playedPlatformId: 'ps3' });
    expect(getRow).toHaveBeenCalledWith(expect.objectContaining({ tableId: 'game_platforms', rowId: 'ps3' }));
    expect(createRow).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ playedPlatformId: 'ps3', playedPlatform: null }) }));
    await service.createEntry('u1', { gameId: 'g1', status: 'completed' });
    expect(createRow).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ playedPlatformId: 'ps3' }) }));
    await service.createEntry('u1', { gameId: 'g1', playedPlatformId: null });
    expect(createRow).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ playedPlatformId: null, playedPlatform: null }) }));
  });
  it('rejects an unknown platform before creating an entry', async () => {
    const createRow = jest.fn();
    const { service } = make({ createRow,
      listRows: jest.fn().mockResolvedValue({ rows: [{ fingerprint: 'f1' }] }),
      getRow: jest.fn().mockRejectedValue({ code: 404 }),
    });
    await expect(service.createEntry('u1', { gameId: 'g1', playedPlatformId: 'missing' })).rejects.toThrow();
    expect(createRow).not.toHaveBeenCalled();
  });
  it('rejects writing another owner list', async () => {
    const { service } = make({
      listRows: jest
        .fn()
        .mockResolvedValue({ rows: [{ $id: 'p1', fingerprint: 'f1' }] }),
      getRow: jest
        .fn()
        .mockResolvedValue({ $id: 'list-1', ownerFingerprint: 'f2' }),
    });
    await expect(
      service.updateList('u1', 'list-1', { title: 'Other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reuses a legacy vote row and its count delta', async () => {
    const upsertRow = jest.fn().mockResolvedValue({});
    const createOperations = jest.fn().mockResolvedValue({});
    const { service } = make({
      getRow: jest.fn().mockResolvedValue({ $id: 'comment-1', voteCount: 2 }),
      listRows: jest
        .fn()
        .mockResolvedValue({ rows: [{ $id: 'legacy-vote', type: 'up' }] }),
      upsertRow,
      createOperations,
    });
    await expect(
      service.voteComment('u1', 'comment-1', 'down'),
    ).resolves.toEqual({ voteCount: 0, viewerVote: 'down' });
    expect(upsertRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 'legacy-vote' }),
    );
    expect(createOperations).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-1' }),
    );
  });

  it('keeps comment score nonnegative on the first downvote', async () => {
    const createOperations = jest.fn();
    const { service } = make({
      getRow: jest.fn().mockResolvedValue({ $id: 'c1', voteCount: 0 }),
      listRows: jest.fn().mockResolvedValue({ rows: [] }),
      upsertRow: jest.fn().mockResolvedValue({}),
      createOperations,
    });
    await expect(service.voteComment('u1', 'c1', 'down')).resolves.toEqual({
      voteCount: 0,
      viewerVote: 'down',
    });
    expect(createOperations).not.toHaveBeenCalled();
  });
  it('keeps a complete cover URL or omits it from the preview', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(250);
    const createRow = jest
      .fn()
      .mockImplementation(async ({ data }) => ({ $id: 'item-1', ...data }));
    const getRow = jest
      .fn()
      .mockImplementation(async ({ tableId }) =>
        tableId === 'lists'
          ? { $id: 'list-1', ownerFingerprint: 'f1', latestAdditions: [] }
          : { $id: 'game-1', name: 'Game', coverUrl: longUrl },
      );
    const listRows = jest
      .fn()
      .mockResolvedValue({ rows: [{ $id: 'p1', fingerprint: 'f1' }] });
    const { service } = make({
      getRow,
      listRows,
      createRow,
      createOperations: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({ $id: 'list-1' }),
    });
    await service.createItem('u1', 'list-1', {
      gameId: 'game-1',
      orderKey: 'a',
    });
    const update = (service as any).appwrite.tablesDB.updateRow as jest.Mock;
    const preview = JSON.parse(update.mock.calls[0][0].data.latestAdditions[0]);
    expect(preview.gameCoverUrl).toBe('');
    expect(preview.gameCoverUrl).not.toBe(longUrl.slice(0, 100));
    getRow.mockImplementation(async ({ tableId }) =>
      tableId === 'lists'
        ? { $id: 'list-1', ownerFingerprint: 'f1', latestAdditions: [] }
        : {
            $id: 'game-1',
            name: 'Game',
            coverUrl: 'https://example.com/cover.jpg',
          },
    );
    await service.createItem('u1', 'list-1', {
      gameId: 'game-1',
      orderKey: 'b',
    });
    const secondPreview = JSON.parse(
      update.mock.calls[1][0].data.latestAdditions[0],
    );
    expect(secondPreview.gameCoverUrl).toBe('https://example.com/cover.jpg');
  });
  it('propagates outbox failures so the transaction runner can roll back', async () => {
    const createRow = jest.fn().mockResolvedValue({ $id: 'list-1' });
    const outbox = {
      enqueue: jest.fn().mockRejectedValue(new Error('outbox unavailable')),
      processOutbox: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = make(
      {
        listRows: jest
          .fn()
          .mockResolvedValue({ rows: [{ $id: 'p1', fingerprint: 'f1' }] }),
        createRow,
      },
      outbox,
    );
    await expect(
      service.createList('u1', { title: 'My list' }),
    ).rejects.toThrow('outbox unavailable');
  });
});
