import { FoundersService } from './founders.service';

describe('Founder reservations', () => {
  function setup(users: any[], initial?: any) {
    const rows = new Map<string, any>();
    if (initial)
      rows.set('founder_state:edition-v1', { $id: 'edition-v1', ...initial });
    const getRow = jest.fn(async ({ tableId, rowId }) => {
      const row = rows.get(`${tableId}:${rowId}`);
      if (!row) throw { code: 404 };
      return { ...row };
    });
    const createRow = jest.fn(async ({ tableId, rowId, data }) => {
      if (rows.has(`${tableId}:${rowId}`)) throw { code: 409 };
      rows.set(`${tableId}:${rowId}`, { $id: rowId, ...data });
    });
    const updateRow = jest.fn(async ({ tableId, rowId, data }) => {
      rows.set(`${tableId}:${rowId}`, {
        ...rows.get(`${tableId}:${rowId}`),
        ...data,
      });
    });
    const list = jest.fn(async ({ queries }) => {
      const state = rows.get('founder_state:edition-v1');
      return {
        users: users
          .filter(
            (user) =>
              !state?.afterCreatedAt ||
              user.$createdAt > state.afterCreatedAt ||
              (user.$createdAt === state.afterCreatedAt &&
                user.$id > state.afterUserId),
          )
          .slice(
            0,
            JSON.parse(
              queries.find((query) => JSON.parse(query).method === 'limit')!,
            ).values[0],
          ),
      };
    });
    const app = {
      tablesDB: { getRow, createRow, updateRow },
      users: {
        list,
        get: jest.fn(async ({ userId }) => ({
          $id: userId,
          $createdAt: '2026-01-01',
          emailVerification: true,
          status: true,
        })),
      },
    };
    const tx = {
      runInTransaction: jest.fn(async (fn) => {
        const snapshot = new Map(rows);
        try {
          return await fn({ txId: 'tx' });
        } catch (error) {
          rows.clear();
          for (const [k, v] of snapshot) rows.set(k, v);
          throw error;
        }
      }),
    };
    return {
      service: new FoundersService(app as any, tx as any),
      rows,
      tx,
      app,
    };
  }
  it('keeps a reservation private until the email is verified, including #0000', async () => {
    const { service, rows, app } = setup([], {
      zeroUserId: 'zero',
      nextNumber: 1,
    });
    rows.set('founder_allocations:zero', { userId: 'zero', number: 0 });
    app.users.get.mockResolvedValueOnce({
      $id: 'zero',
      emailVerification: false,
      status: true,
    } as any);
    expect(await service.forUser('zero')).toBeNull();
    app.users.get.mockResolvedValueOnce({
      $id: 'zero',
      emailVerification: false,
      status: true,
    } as any);
    expect(await service.receipt('zero')).toEqual({
      status: 'verification_required',
    });
    expect((await service.forUser('zero'))?.number).toBe(0);
    expect(await service.receipt('zero')).toEqual({
      status: 'awarded',
      number: 0,
      code: '#0000',
    });
  });

  it('never awards disabled accounts even when the email is verified', async () => {
    const { service, rows, app } = setup([]);
    rows.set('founder_allocations:u', { userId: 'u', number: 12 });
    app.users.get.mockResolvedValueOnce({
      $id: 'u',
      emailVerification: true,
      status: false,
    } as any);
    expect(await service.forUser('u')).toBeNull();
  });

  it('serves only the configured founder image from the private bucket', async () => {
    const getFileView = jest
      .fn()
      .mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const service = new FoundersService(
      { storage: { getFileView } } as any,
      {} as any,
    );
    expect(await service.image()).toEqual(Buffer.from([1, 2, 3]));
    expect(getFileView).toHaveBeenCalledWith({
      bucketId: 'badges',
      fileId: 'founder-badge',
    });
  });

  it('reserves Zero separately and allocates by account creation, including accounts without profiles', async () => {
    const { service, rows } = setup([
      { $id: 'early', $createdAt: '2026-01-01' },
      { $id: 'zero', $createdAt: '2026-01-02' },
      { $id: 'later', $createdAt: '2026-01-03' },
    ]);
    await service.initialize('zero');
    await service.sync();
    expect((await service.forUser('zero'))?.number).toBe(0);
    expect((await service.forUser('early'))?.number).toBe(1);
    expect((await service.forUser('later'))?.number).toBe(2);
    await service.sync();
    expect(rows.size).toBe(4);
    await expect(service.initialize('impostor')).rejects.toThrow(
      'outro usuário',
    );
  });
  it('does not enable allocation before an explicit bootstrap', async () => {
    const { service, app } = setup([]);
    await service.sync();
    expect(app.users.list).not.toHaveBeenCalled();
  });
  it('limits the edition to #1000 and does not reuse a deleted account number', async () => {
    const { service, app } = setup(
      [
        { $id: 'last', $createdAt: '2026-01-02' },
        { $id: 'overflow', $createdAt: '2026-01-03' },
      ],
      {
        zeroUserId: 'zero',
        nextNumber: 1000,
        afterCreatedAt: '2026-01-01',
        afterUserId: 'deleted',
      },
    );
    await service.sync();
    expect((await service.forUser('last'))?.number).toBe(1000);
    expect(await service.forUser('overflow')).toBeNull();
    app.users.list.mockClear();
    await service.sync();
    expect(app.users.list).not.toHaveBeenCalled();
  });
  it('retries a conflicting transaction without skipping or duplicating numbers', async () => {
    const { service, tx } = setup([{ $id: 'a', $createdAt: '2026-01-02' }], {
      zeroUserId: 'zero',
      nextNumber: 1,
    });
    tx.runInTransaction.mockRejectedValueOnce({ code: 409 });
    await service.sync();
    expect((await service.forUser('a'))?.number).toBe(1);
    expect(tx.runInTransaction).toHaveBeenCalledTimes(2);
  });
  it('does not move the checkpoint backwards when a zero-only batch was read before another worker committed', async () => {
    const { service, rows, tx } = setup(
      [{ $id: 'zero', $createdAt: '2026-01-02' }],
      {
        zeroUserId: 'zero',
        nextNumber: 1,
        afterCreatedAt: '2026-01-01',
        afterUserId: 'a',
      },
    );
    const run = tx.runInTransaction.getMockImplementation()!;
    tx.runInTransaction.mockImplementationOnce(async (fn) => {
      rows.set('founder_state:edition-v1', {
        $id: 'edition-v1',
        zeroUserId: 'zero',
        nextNumber: 2,
        afterCreatedAt: '2026-01-03',
        afterUserId: 'b',
      });
      rows.set('founder_allocations:b', { userId: 'b', number: 1 });
      return run(fn);
    });
    await service.sync();
    expect(rows.get('founder_state:edition-v1').nextNumber).toBe(2);
    expect(rows.get('founder_state:edition-v1').afterUserId).toBe('b');
  });

  it('continues through multiple batches with timestamp ties without gaps', async () => {
    const users = Array.from({ length: 125 }, (_, i) => ({
      $id: `u${String(i).padStart(3, '0')}`,
      $createdAt: '2026-01-02',
    }));
    const { service, rows, app } = setup(users, {
      zeroUserId: 'zero',
      nextNumber: 1,
    });
    await service.sync();
    expect((await service.forUser('u000'))?.number).toBe(1);
    expect((await service.forUser('u124'))?.number).toBe(125);
    expect(rows.get('founder_state:edition-v1').nextNumber).toBe(126);
    expect(app.users.list).toHaveBeenCalledTimes(4);
  });

  it('publishes only the gamertag and number of active profiles, independently of consent', async () => {
    const listRows = jest.fn(async ({ tableId }) => ({
      rows:
        tableId === 'founder_allocations'
          ? [{ $id: 'zero', userId: 'zero', number: 0 }]
          : [
              {
                $id: 'p',
                userId: 'zero',
                gamertag: 'Zero',
                status: 'active',
                profileSharingAllowed: false,
              },
              {
                $id: 'deleted',
                userId: 'zero',
                gamertag: 'Former',
                status: 'pending_deletion',
              },
            ],
    }));
    const service = new FoundersService(
      {
        tablesDB: { listRows },
        users: {
          list: jest.fn().mockResolvedValue({ users: [{ $id: 'zero' }] }),
        },
      } as any,
      {} as any,
    );
    expect(await service.publicIdentities()).toEqual([
      { gamertag: 'Zero', number: 0 },
    ]);
    expect(listRows.mock.calls.map(([params]) => params.tableId)).toEqual([
      'founder_allocations',
      'user_profiles',
    ]);
  });

  it('rolls back the checkpoint when allocation fails and propagates infrastructure errors', async () => {
    const { service, rows, app } = setup(
      [{ $id: 'a', $createdAt: '2026-01-02' }],
      { zeroUserId: 'zero', nextNumber: 1 },
    );
    app.tablesDB.createRow.mockRejectedValueOnce(new Error('offline'));
    await expect(service.sync()).rejects.toThrow('offline');
    expect(rows.get('founder_state:edition-v1').nextNumber).toBe(1);
    expect(await service.forUser('a')).toBeNull();
  });
});
