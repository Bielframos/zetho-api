import { AppwriteException } from 'node-appwrite';
import type { OutboxService } from 'src/infra/events/outbox.service';
import type { TimelineService } from 'src/system/dashboard/timeline.service';
import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { TransactionService } from 'src/infra/appwrite/transaction.service';
import { SocialService } from './social.service';

type MockRow = { $id: string; [key: string]: unknown };
type ReadArgs = { tableId: string; rowId: string };
type WriteArgs = ReadArgs & {
  data: Record<string, unknown>;
  transactionId?: string;
};

describe('Acquisition persistence', () => {
  function setup(status?: string) {
    const rows = new Map<string, MockRow>();
    const db = {
      getRow: jest.fn(({ tableId, rowId }: ReadArgs) => {
        if (tableId === 'games')
          return Promise.resolve({ $id: rowId, name: 'Game' });
        const value = rows.get(`${tableId}:${rowId}`);
        if (!value)
          return Promise.reject(new AppwriteException('Not found', 404));
        return Promise.resolve(value);
      }),
      listRows: jest.fn(({ tableId }: { tableId: string }) =>
        Promise.resolve({
          rows:
            tableId === 'user_profiles'
              ? [{ $id: 'p', fingerprint: 'f' }]
              : status
                ? [{ $id: 'old', status }]
                : [],
        }),
      ),
      createRow: jest.fn(({ tableId, rowId, data }: WriteArgs) => {
        const value = { $id: rowId, ...data };
        rows.set(`${tableId}:${rowId}`, value);
        return Promise.resolve(value);
      }),
      updateRow: jest.fn(({ tableId, rowId, data }: WriteArgs) => {
        rows.set(`${tableId}:${rowId}`, { $id: rowId, ...data });
        return Promise.resolve();
      }),
    };
    const outbox = {
      enqueue: jest.fn(),
      processOutbox: jest.fn().mockResolvedValue(undefined),
    };
    const transactions = {
      runInTransaction: jest.fn(
        (fn: (ctx: { txId: string }) => Promise<unknown>) => fn({ txId: 'tx' }),
      ),
    };
    const service = new SocialService(
      { tablesDB: db } as unknown as Appwrite,
      transactions as unknown as TransactionService,
      outbox as unknown as OutboxService,
      {} as TimelineService,
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
    db.getRow.mockImplementation(({ tableId }) => {
      if (tableId === 'games') return Promise.resolve({ $id: 'g' });
      return Promise.reject(new AppwriteException('Unavailable', 503));
    });
    await expect(
      service.ensureEntry('u', { gameId: 'g', requestId: 'a' }),
    ).rejects.toMatchObject({ code: 503 });
    expect(db.createRow).not.toHaveBeenCalled();
  });
});
