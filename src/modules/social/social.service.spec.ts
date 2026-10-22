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

  it('creates a forum post with sanitized rich text, title, and SEO slug', async () => {
    const createRow = jest
      .fn()
      .mockImplementation(async ({ rowId, data }) => ({ $id: rowId, ...data }));
    const { service } = make({
      listRows: jest
        .fn()
        .mockResolvedValue({ rows: [{ $id: 'p1', fingerprint: 'f1' }] }),
      createRow,
    });

    const created = await service.createComment('u1', {
      gameId: 'game-1',
      title: 'Dicas para iniciantes no modo difícil',
      content:
        '<p>Use <strong>defesa perfeita</strong> contra chefes.</p><script>alert(1)</script>',
    });

    expect(created.title).toBe('Dicas para iniciantes no modo difícil');
    expect(created.slug).toMatch(
      /^dicas-para-iniciantes-no-modo-dificil--.+/,
    );
    expect(created.content).toBe(
      '<p>Use <strong>defesa perfeita</strong> contra chefes.</p>',
    );
    expect(created.depth).toBe(0);
  });

  it('enforces reply depth limit of 3 and allows author or admin to edit and delete in cascade', async () => {
    const getRow = jest.fn().mockImplementation(async ({ rowId }) => {
      if (rowId === 'depth-3') {
        return {
          $id: 'depth-3',
          gameId: 'game-1',
          userProfile: 'p2',
          parentId: 'depth-2',
          depth: 3,
        };
      }
      if (rowId === 'post-1') {
        return {
          $id: 'post-1',
          gameId: 'game-1',
          userProfile: 'p2',
          parentId: null,
          depth: 0,
        };
      }
      return { $id: rowId, gameId: 'game-1', userProfile: 'p2' };
    });
    const listRows = jest
      .fn()
      .mockImplementation(async ({ tableId }) =>
        tableId === 'user_profiles'
          ? { rows: [{ $id: 'p1', fingerprint: 'f1' }] }
          : { rows: [] },
      );
    const updateRow = jest
      .fn()
      .mockImplementation(async ({ rowId, data }) => ({ $id: rowId, ...data }));
    const deleteRow = jest.fn().mockResolvedValue({});

    const { service } = make({
      getRow,
      listRows,
      updateRow,
      deleteRow,
    });

    await expect(
      service.createComment('u1', {
        gameId: 'game-1',
        parentId: 'depth-3',
        content: 'Resposta além do limite',
      }),
    ).rejects.toThrow('Limite de profundidade de respostas atingido');

    await expect(
      service.updateComment(
        'u1',
        'post-1',
        { title: 'Novo título', content: '<p>Texto atualizado</p>' },
        false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const updatedByAdmin = await service.updateComment(
      'u1',
      'post-1',
      { title: 'Título moderado', content: '<p>Texto moderado</p>' },
      true,
    );
    expect(updatedByAdmin.title).toBe('Título moderado');

    await expect(
      service.deleteComment('u1', 'post-1', false),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const deletedByAdmin = await service.deleteComment('u1', 'post-1', true);
    expect(deletedByAdmin).toEqual({ success: true, deletedCount: 1 });
  });
});
