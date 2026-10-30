import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { TransactionService } from 'src/infra/appwrite/transaction.service';
import { ProfileService } from './profile.service';
import { AppwriteException, Models } from 'node-appwrite';

type MockRow = { $id: string; [key: string]: unknown };
type ReadArgs = { tableId: string; rowId: string };
type WriteArgs = ReadArgs & {
  data: Record<string, unknown>;
  transactionId?: string;
};

describe('Registration completion receipts', () => {
  function setup() {
    const rows = new Map<string, MockRow>();
    const inviter = {
      $id: 'inviter-profile',
      userId: 'inviter',
      status: 'active',
      inviteCode: 'valid',
    };
    const db = {
      listRows: jest.fn(({ queries }: { queries: string[] }) => {
        const parsed = queries.map(
          (query) =>
            JSON.parse(query) as { attribute?: string; values: string[] },
        );
        const invite = parsed.find((q) => q.attribute === 'inviteCode');
        const profiles = [...rows.entries()]
          .filter(([key]) => key.startsWith('user_profiles:'))
          .map(([, value]) => value);
        return Promise.resolve(
          invite
            ? {
                rows: invite.values[0] === 'valid' ? [inviter] : [],
                total: invite.values[0] === 'valid' ? 1 : 0,
              }
            : { rows: profiles, total: profiles.length },
        );
      }),
      getRow: jest.fn(({ tableId, rowId }: ReadArgs) => {
        const row = rows.get(`${tableId}:${rowId}`);
        if (!row)
          return Promise.reject(new AppwriteException('Not found', 404));
        return Promise.resolve(row);
      }),
      createRow: jest.fn(({ tableId, rowId, data }: WriteArgs) => {
        const row = { $id: rowId, ...data };
        rows.set(`${tableId}:${rowId}`, row);
        return Promise.resolve(row);
      }),
      updateRow: jest.fn(({ tableId, rowId, data }: WriteArgs) => {
        const row = { $id: rowId, ...rows.get(`${tableId}:${rowId}`), ...data };
        rows.set(`${tableId}:${rowId}`, row);
        return Promise.resolve(row);
      }),
      createOperations: jest.fn(),
    };
    const service = new ProfileService(
      { tablesDB: db } as unknown as Appwrite,
      {
        runInTransaction: <T>(work: (ctx: { txId: string }) => Promise<T>) =>
          work({ txId: 'tx' }),
      } as TransactionService,
    );
    return { service, db, rows };
  }
  const user = { $id: 'user', email: 'test@example.com' } as Models.User;
  it('distinguishes an accepted invitation without exposing it in analytics metadata', async () => {
    const { service } = setup();
    const profile = await service.create(user, 'player', 'valid');
    expect(profile.registration).toEqual({
      created: true,
      inviteAccepted: true,
    });
    expect(
      (await service.create(user, 'player', 'valid')).registration.created,
    ).toBe(false);
  });
  it('rejects invalid invitations before creating the profile or granting a bonus', async () => {
    const { service, db } = setup();
    await expect(service.create(user, 'player', 'invalid')).rejects.toThrow(
      'Código de convite inválido',
    );
    expect(db.createRow).not.toHaveBeenCalled();
    expect(db.createOperations).not.toHaveBeenCalled();
  });
  it('resumes a failed completion without paying welcome/invitation twice', async () => {
    const { service, db } = setup();
    const update = db.updateRow.getMockImplementation()!;
    let failed = false;
    db.updateRow.mockImplementation(async (args) => {
      if (args.data.type === 'registration_complete' && !failed) {
        failed = true;
        throw new Error('completion unavailable');
      }
      return update(args);
    });
    await expect(service.create(user, 'player', 'valid')).rejects.toThrow(
      'completion unavailable',
    );
    const listRows = db.listRows.getMockImplementation()!;
    db.listRows.mockImplementation((args) => {
      if (
        args.queries.some(
          (query: string) =>
            (JSON.parse(query) as { attribute?: string }).attribute ===
            'inviteCode',
        )
      )
        return Promise.resolve({ rows: [], total: 0 });
      return listRows(args);
    });
    const result = await service.create(user, 'player');
    expect(result.registration).toEqual({
      created: true,
      inviteAccepted: true,
    });
    const rewards = db.createRow.mock.calls.filter(
      ([call]) => call.tableId === 'zcoin_transactions',
    );
    expect(rewards).toHaveLength(2);
    expect((await service.create(user, 'player')).registration.created).toBe(
      false,
    );
  });
  it('does not turn an existing legacy account into a new signup', async () => {
    const { service, rows, db } = setup();
    rows.set('user_profiles:legacy', {
      $id: 'legacy',
      gamertag: 'player',
      fingerprint: 'legacy',
    });
    expect(
      (await service.create(user, 'player', 'valid')).registration,
    ).toEqual({ created: false, inviteAccepted: false });
    expect(db.createOperations).not.toHaveBeenCalled();
  });
});
