import {
  applyFounderRecalculation,
  buildVerifiedFounderPlan,
  founderChanges,
} from './recalculate-founders';

const account = (id: string, date: string, verified = true, active = true) => ({
  $id: id,
  $createdAt: date,
  emailVerification: verified,
  status: active,
});
const accounts = [
  account('zero', '2026-01-03'),
  account('old', '2026-01-01'),
  account('unverified', '2026-01-02', false),
  account('new', '2026-01-04'),
  account('disabled', '2026-01-05', true, false),
];

describe('Verified founder recalculation', () => {
  it('keeps Zero, removes ineligible accounts and closes gaps by creation date', () => {
    expect(
      buildVerifiedFounderPlan(accounts, 'zero').map((row) => [
        row.userId,
        row.number,
      ]),
    ).toEqual([
      ['zero', 0],
      ['old', 1],
      ['new', 2],
    ]);
  });
  it('breaks creation-date ties by account ID and caps the edition at #1000', () => {
    const many = Array.from({ length: 1100 }, (_, i) =>
      account(`u${String(i).padStart(4, '0')}`, '2026-01-01'),
    ).reverse();
    const plan = buildVerifiedFounderPlan([accounts[0], ...many], 'zero');
    expect(plan).toHaveLength(1001);
    expect(plan[1].userId).toBe('u0000');
    expect(plan.at(-1)?.userId).toBe('u0999');
    expect(plan.at(-1)?.number).toBe(1000);
  });
  it('refuses a missing, disabled or unverified Zero', () => {
    for (const zero of [
      [],
      [account('zero', '2026-01-01', false)],
      [account('zero', '2026-01-01', true, false)],
    ])
      expect(() => buildVerifiedFounderPlan(zero, 'zero')).toThrow('#0000');
  });

  function setup() {
    const state = {
      $id: 'edition-v1',
      $updatedAt: 'v1',
      zeroUserId: 'zero',
      nextNumber: 5,
    };
    const allocations = [
      {
        ...buildVerifiedFounderPlan(accounts, 'zero')[0],
        $id: 'zero',
        $updatedAt: 'v1',
      },
      {
        userId: 'old',
        number: 1,
        accountCreatedAt: '2026-01-01',
        $id: 'old',
        $updatedAt: 'v1',
      },
      {
        userId: 'unverified',
        number: 2,
        accountCreatedAt: '2026-01-02',
        $id: 'unverified',
        $updatedAt: 'v1',
      },
      {
        userId: 'new',
        number: 3,
        accountCreatedAt: '2026-01-04',
        $id: 'new',
        $updatedAt: 'v1',
      },
      {
        userId: 'deleted',
        number: 4,
        accountCreatedAt: '2026-01-05',
        $id: 'deleted',
        $updatedAt: 'v1',
      },
    ];
    const rows = new Map<string, any>([
      ['edition-v1', { ...state }],
      ...allocations.map((row): [string, any] => [row.$id, { ...row }]),
    ]);
    const db = {
      getRow: jest.fn(async ({ rowId }) => ({ ...rows.get(rowId) })),
      updateRow: jest.fn(async ({ rowId, data }) => {
        rows.set(rowId, { ...rows.get(rowId), ...data });
      }),
      deleteRow: jest.fn(async ({ rowId }) => {
        rows.delete(rowId);
      }),
      createRow: jest.fn(async ({ rowId, data }) => {
        if ([...rows.values()].some((row) => row.number === data.number))
          throw new Error('Unique number conflict');
        rows.set(rowId, { $id: rowId, ...data });
      }),
    };
    const app = {
      tablesDB: db,
      users: {
        get: jest.fn(async ({ userId }) =>
          accounts.find((user) => user.$id === userId),
        ),
      },
    };
    const tx = {
      runInTransaction: jest.fn(async (fn) => {
        const snapshot = new Map(rows);
        try {
          return await fn({ txId: 'tx' });
        } catch (error) {
          rows.clear();
          for (const [key, value] of snapshot) rows.set(key, value);
          throw error;
        }
      }),
    };
    const plan = buildVerifiedFounderPlan(accounts, 'zero');
    const apply = (max = 100) =>
      applyFounderRecalculation(
        app as any,
        tx as any,
        state,
        allocations,
        plan,
        max,
      );
    return { state, allocations, plan, rows, app, tx, apply };
  }

  it('releases reservations and renumbers atomically without deleting accounts or profiles', async () => {
    const { apply, rows, app, tx, plan } = setup();
    await apply();
    expect(rows.get('edition-v1')).toMatchObject({
      nextNumber: 3,
      afterCreatedAt: null,
      afterUserId: null,
    });
    expect(rows.has('unverified')).toBe(false);
    expect(rows.has('deleted')).toBe(false);
    expect(rows.get('new').number).toBe(2);
    expect(rows.get('zero').number).toBe(0);
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(
      app.tablesDB.deleteRow.mock.calls.every(
        ([p]) =>
          p.tableId === 'founder_allocations' && p.transactionId === 'tx',
      ),
    ).toBe(true);
    expect(
      founderChanges(
        [...rows.values()].filter((row) => row.userId),
        plan,
      ),
    ).toEqual({ remove: [], create: [] });
  });
  it('rejects an operation limit before performing any writes', async () => {
    const { apply, tx } = setup();
    await expect(apply(2)).rejects.toThrow('limite transacional');
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });
  it('refuses a stale checkpoint instead of overwriting a concurrent allocation', async () => {
    const { apply, rows, app } = setup();
    rows.get('edition-v1').$updatedAt = 'v2';
    await expect(apply()).rejects.toThrow('Checkpoint mudou');
    expect(app.tablesDB.deleteRow).not.toHaveBeenCalled();
  });
  it('rolls back renumbering and checkpoint if a write fails', async () => {
    const { apply, rows, app } = setup();
    app.tablesDB.createRow.mockRejectedValueOnce(new Error('offline'));
    await expect(apply()).rejects.toThrow('offline');
    expect(rows.get('edition-v1').nextNumber).toBe(5);
    expect(rows.get('unverified').number).toBe(2);
    expect(rows.get('new').number).toBe(3);
  });
  it('refuses an account that loses verification after the preview', async () => {
    const { apply, app, tx } = setup();
    app.users.get.mockResolvedValueOnce(account('zero', '2026-01-03', false));
    await expect(apply()).rejects.toThrow('Elegibilidade mudou');
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });
  it('rolls back if an allocation changed outside the allocator checkpoint', async () => {
    const { apply, rows } = setup();
    rows.get('new').$updatedAt = 'v2';
    await expect(apply()).rejects.toThrow('atribuição mudou');
    expect(rows.get('edition-v1').nextNumber).toBe(5);
    expect(rows.get('new').number).toBe(3);
  });
});
