import { SocialService } from './social.service';

describe('Acquisition persistence', () => {
  function setup(status?: string) {
    const rows = new Map<string, any>();
    const db = {
      getRow: jest.fn(async ({ tableId, rowId }) => {
        if (tableId === 'games') return { $id: rowId, name: 'Game' };
        const value = rows.get(`${tableId}:${rowId}`);
        if (!value) throw { code: 404 };
        return value;
      }),
      listRows: jest.fn(async ({ tableId }) => ({
        rows:
          tableId === 'user_profiles'
            ? [{ $id: 'p', fingerprint: 'f' }]
            : status
              ? [{ $id: 'old', status }]
              : [],
      })),
      createRow: jest.fn(async ({ tableId, rowId, data }) => {
        const value = { $id: rowId, ...data };
        rows.set(`${tableId}:${rowId}`, value);
        return value;
      }),
      updateRow: jest.fn(async ({ tableId, rowId, data }) => {
        rows.set(`${tableId}:${rowId}`, { $id: rowId, ...data });
      }),
    };
    const outbox = {
      enqueue: jest.fn(),
      processOutbox: jest.fn().mockResolvedValue(undefined),
    };
    const transactions = {
      runInTransaction: jest.fn(async (fn) => fn({ txId: 'tx' })),
    };
    const service = new SocialService(
      { tablesDB: db } as any,
      transactions as any,
      outbox as any,
      {} as any,
    );
    return { service, db, rows, outbox, transactions };
  }
  it('persists once and emits the milestone only on the first successful write', async () => {
    const { service, db } = setup();
    expect(
      await service.ensureEntry('u', { gameId: 'g', requestId: 'action-1' }),
    ).toEqual({ saved: true, firstGameSaved: true });
    expect(
      await service.ensureEntry('u', { gameId: 'g', requestId: 'action-1' }),
    ).toEqual({ saved: true, firstGameSaved: false });
    expect(
      db.createRow.mock.calls.filter(([call]) => call.tableId === 'z_entries'),
    ).toHaveLength(1);
    const milestone = db.createRow.mock.calls.find(
      ([call]) => call.data.type === 'first_game_saved',
    )![0];
    expect(milestone).toMatchObject({ transactionId: 'tx' });
  });
  it('preserves an existing status instead of toggling it or replacing it', async () => {
    const { service, db } = setup('completed');
    expect(
      await service.ensureEntry('u', { gameId: 'g', requestId: 'a' }),
    ).toEqual({ saved: true, firstGameSaved: false });
    expect(
      db.createRow.mock.calls.some(([call]) => call.tableId === 'z_entries'),
    ).toBe(false);
  });
  it('does not claim success on catalog or outbox failure', async () => {
    const { service, db, outbox } = setup();
    db.getRow.mockRejectedValueOnce({ code: 404 });
    await expect(
      service.ensureEntry('u', { gameId: 'missing', requestId: 'a' }),
    ).rejects.toThrow();
    expect(db.createRow).not.toHaveBeenCalled();
    outbox.enqueue.mockRejectedValueOnce(
      new Error('outbox unavailable') as never,
    );
    await expect(
      service.ensureEntry('u', { gameId: 'g', requestId: 'b' }),
    ).rejects.toThrow('outbox unavailable');
  });
  it('retries a transaction conflict without changing toggle behavior', async () => {
    const { service, transactions } = setup();
    transactions.runInTransaction.mockRejectedValueOnce({ code: 409 });
    await expect(
      service.ensureEntry('u', { gameId: 'g', requestId: 'a' }),
    ).resolves.toMatchObject({ saved: true });
    expect(transactions.runInTransaction).toHaveBeenCalledTimes(2);
  });
  it('propagates infrastructure read failures instead of treating them as a first visit', async () => {
    const { service, db } = setup();
    db.getRow.mockImplementation(async ({ tableId }) => {
      if (tableId === 'games') return { $id: 'g' };
      throw { code: 503 };
    });
    await expect(
      service.ensureEntry('u', { gameId: 'g', requestId: 'a' }),
    ).rejects.toEqual({ code: 503 });
    expect(db.createRow).not.toHaveBeenCalled();
  });
});
