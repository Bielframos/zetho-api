import { AchievementsService } from './achievements.service';

describe('AchievementsService', () => {
  it('counts distinct completed games in the annual goal from materialized events', async () => {
    const listRows = jest.fn().mockImplementation(({ tableId }) => {
      if (tableId === 'annual_goals')
        return Promise.resolve({ rows: [{ target: 12 }], total: 1 });
      if (tableId === 'completion_events')
        return Promise.resolve({ rows: [{ $id: 'one' }], total: 7 });
      throw new Error(`unexpected ${tableId}`);
    });
    const service = new AchievementsService(
      {
        tablesDB: {
          listRows,
          getRow: jest.fn().mockResolvedValue({ $id: 'p' }),
        },
      } as any,
      {} as any,
      {} as any,
    );
    expect(await service.getAnnualGoal('p', 2026)).toEqual({
      profileId: 'p',
      year: 2026,
      target: 12,
      completed: 7,
    });
    expect(listRows).not.toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'z_entries' }),
    );
  });

  it('does not duplicate a materialized completion on replay', async () => {
    const createRow = jest.fn().mockRejectedValue({ code: 409 });
    const service = new AchievementsService(
      { tablesDB: { createRow } } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.recordCompletion('p', 'g', '2026-01-02T00:00:00Z'),
    ).resolves.toBeUndefined();
    await service.recordCompletion('p', 'g', '2026-04-02T00:00:00Z');
    expect(createRow.mock.calls[0][0].rowId).toBe(
      createRow.mock.calls[1][0].rowId,
    );
  });
});

describe('AchievementsService awards and access', () => {
  const profile = {
    $id: 'p',
    userId: 'owner',
    fingerprint: 'f',
    showcaseBadges: [],
    zcoinBalance: 10,
  };
  it('rejects another user changing a goal or showcase', async () => {
    const service = new AchievementsService(
      { tablesDB: { getRow: jest.fn().mockResolvedValue(profile) } } as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.setAnnualGoal('stranger', 'p', 2026, 10),
    ).rejects.toThrow('Perfil não pertence');
    await expect(service.setShowcase('stranger', 'p', [])).rejects.toThrow(
      'Perfil não pertence',
    );
  });
  it('awards only active reviews strictly longer than 300 visible characters and completed hosted sessions', async () => {
    const createRow = jest.fn().mockResolvedValue({});
    const createOperations = jest.fn().mockResolvedValue({});
    const listRows = jest.fn().mockImplementation(({ tableId }) => {
      if (tableId === 'completion_events' || tableId === 'games')
        return Promise.resolve({ rows: [], total: 0 });
      if (tableId === 'ratings')
        return Promise.resolve({
          rows: [
            ...Array.from({ length: 5 }, (_, i) => ({
              $id: `r${i}`,
              content: `<p>${'x'.repeat(301)}</p>`,
            })),
            { $id: 'short', content: `<p>${'x'.repeat(300)}</p>` },
          ],
          total: 6,
        });
      if (tableId === 'gameplay_sessions')
        return Promise.resolve({
          rows: [{ $id: 's1' }, { $id: 's2' }, { $id: 's3' }],
          total: 3,
        });
      if (tableId === 'user_badges')
        return Promise.resolve({ rows: [], total: 0 });
      throw new Error(tableId);
    });
    const tx = {
      runInTransaction: jest.fn(async (fn: any) => fn({ txId: 'tx' })),
    };
    const service = new AchievementsService(
      {
        tablesDB: {
          getRow: jest.fn().mockResolvedValue(profile),
          listRows,
          createRow,
          createOperations,
        },
      } as any,
      tx as any,
      {} as any,
    );
    const result = await service.reconcile('p');
    expect(result.counts).toEqual({
      soulslike_3: 0,
      reviews_5: 5,
      sessions_3: 3,
    });
    expect(tx.runInTransaction).toHaveBeenCalledTimes(2);
    expect(createOperations).toHaveBeenCalledTimes(2);
    expect(createOperations.mock.calls[0][0].operations[0].action).toBe(
      'increment',
    );
    expect(
      listRows.mock.calls
        .find(([args]) => args.tableId === 'gameplay_sessions')?.[0]
        .queries.join(' '),
    ).toContain('completed');
  });
  it('treats a duplicate badge transaction as a no-op without a second increment', async () => {
    const createOperations = jest.fn();
    const tx = { runInTransaction: jest.fn().mockRejectedValue({ code: 409 }) };
    const service = new AchievementsService(
      { tablesDB: { createOperations } } as any,
      tx as any,
      {} as any,
    );
    await expect(
      (service as any).award(profile, 'reviews_5'),
    ).resolves.toBeUndefined();
    expect(createOperations).not.toHaveBeenCalled();
  });
  it('counts decoded visible review characters and exposes the complete badge catalog', async () => {
    const listRows = jest.fn().mockImplementation(({ tableId }) => {
      if (
        tableId === 'completion_events' ||
        tableId === 'games' ||
        tableId === 'gameplay_sessions'
      )
        return Promise.resolve({ rows: [], total: 0 });
      if (tableId === 'ratings')
        return Promise.resolve({
          rows: [
            { content: `<p>${'&amp;'.repeat(300)}</p>` },
            {
              content: `<p>${'&amp;'.repeat(301)}</p><script>${'x'.repeat(400)}</script>`,
            },
          ],
          total: 2,
        });
      if (tableId === 'user_badges')
        return Promise.resolve({
          rows: [{ badgeId: 'reviews_5', $createdAt: '2026-01-01T00:00:00Z' }],
          total: 1,
        });
      throw new Error(tableId);
    });
    const service = new AchievementsService(
      {
        tablesDB: {
          getRow: jest
            .fn()
            .mockResolvedValue({ ...profile, showcaseBadges: ['reviews_5'] }),
          listRows,
        },
      } as any,
      {} as any,
      {} as any,
    );
    const catalog = await service.getBadgeCatalog('p');
    expect(catalog).toHaveLength(3);
    expect(catalog.find((badge) => badge.id === 'reviews_5')).toEqual(
      expect.objectContaining({
        progress: 1,
        threshold: 5,
        rewardZCoins: 25,
        showcased: true,
        unlockedAt: '2026-01-01T00:00:00Z',
      }),
    );
    expect(catalog.find((badge) => badge.id === 'soulslike_3')).toEqual(
      expect.objectContaining({ progress: 0, unlockedAt: null }),
    );
  });
});
