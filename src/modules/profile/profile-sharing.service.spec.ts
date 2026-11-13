import { ProfileSharingService } from './profile-sharing.service';

describe('Profile sharing permission', () => {
  function setup() {
    const records = new Map<string, any>();
    const db = {
      getRow: jest.fn(async ({ tableId, rowId }) => {
        const row = records.get(`${tableId}:${rowId}`);
        if (!row) throw { code: 404 };
        return row;
      }),
      createRow: jest.fn(async ({ tableId, rowId, data }) => {
        records.set(`${tableId}:${rowId}`, data);
      }),
      updateRow: jest.fn(async ({ tableId, rowId, data }) => {
        records.set(`${tableId}:${rowId}`, data);
      }),
    };
    const tx = { runInTransaction: jest.fn(async (fn) => fn({ txId: 'tx' })) };
    return {
      service: new ProfileSharingService({ tablesDB: db } as any, tx as any),
      db,
      tx,
    };
  }
  it('defaults existing users to no permission and rejects non-boolean input', async () => {
    const { service, db } = setup();
    expect((await service.get('u')).allowed).toBe(false);
    await expect(
      service.set('u', 'true' as any, 'registration'),
    ).rejects.toThrow();
    expect(db.createRow).not.toHaveBeenCalled();
  });
  it('records versioned consent and revocation privately, preserving later settings on registration retry', async () => {
    const { service, db } = setup();
    await service.set('u', true, 'registration');
    expect((await service.get('u')).allowed).toBe(true);
    expect(db.createRow.mock.calls[0][0].data).toMatchObject({
      version: 'profile-sharing-v1',
      source: 'registration',
      allowed: true,
    });
    await service.set('u', false, 'settings');
    await service.set('u', true, 'registration');
    expect((await service.get('u')).allowed).toBe(false);
    expect(db.updateRow).toHaveBeenCalledTimes(1);
    expect(
      db.createRow.mock.calls.filter(
        ([arg]) => arg.tableId === 'profile_sharing_consent_events',
      ),
    ).toHaveLength(2);
  });
});
