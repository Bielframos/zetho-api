import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { OutboxService } from 'src/infra/events/outbox.service';
import { TimelineService } from 'src/system/dashboard/timeline.service';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';

describe('System lists use the existing social writes', () => {
  function setup(status = 'draft') {
    let list = {
      $id: 'list',
      ownerType: 'system',
      ownerFingerprint: 'system:zetho',
      status,
      revision: 'r1',
      isPublic: true,
    };
    const db = {
      getTable: jest
        .fn()
        .mockResolvedValue({ $permissions: [], rowSecurity: true }),
      listRows: jest.fn(({ tableId }: { tableId: string }) =>
        Promise.resolve({
          rows:
            tableId === 'user_profiles'
              ? [{ $id: 'profile', fingerprint: 'person' }]
              : [],
        }),
      ),
      getRow: jest.fn(({ tableId }: { tableId: string }) =>
        Promise.resolve(
          tableId === 'lists' ? list : { $id: 'game', name: 'Example' },
        ),
      ),
      createRow: jest.fn(
        ({ data, rowId }: { data: Record<string, unknown>; rowId: string }) =>
          Promise.resolve({ $id: rowId, ...data }),
      ),
      updateRow: jest.fn(
        ({
          tableId,
          data,
        }: {
          tableId: string;
          data: Record<string, unknown>;
        }) => {
          if (tableId === 'lists') list = { ...list, ...data };
          return Promise.resolve(list);
        },
      ),
      createOperations: jest.fn().mockResolvedValue({}),
    };
    const transactions = {
      runInTransaction: <T>(work: (ctx: { txId: string }) => Promise<T>) =>
        work({ txId: 'tx' }),
    };
    const service = new SocialService(
      { tablesDB: db } as unknown as Appwrite,
      transactions as TransactionService,
      {
        enqueue: jest.fn(),
        processOutbox: jest.fn().mockResolvedValue(undefined),
      } as unknown as OutboxService,
      {} as TimelineService,
    );
    return { service, db };
  }
  it('creates a system draft only for an admin and uses a stable system URL', async () => {
    const { service, db } = setup();
    await expect(
      service.createList('user', { title: 'Official', ownerType: 'system' }),
    ).rejects.toThrow();
    expect(db.createRow).not.toHaveBeenCalled();
    await service.createList(
      'admin',
      { title: 'Official', ownerType: 'system' },
      true,
    );
    const call = db.createRow.mock.calls[0][0];
    expect(call).toMatchObject({
      permissions: [],
      data: {
        status: 'draft',
        ownerType: 'system',
        ownerFingerprint: 'system:zetho',
        slug: `zetho-${call.rowId}`,
      },
    });
  });
  it('accepts item edits from admins on drafts and invalidates the reviewed revision', async () => {
    const { service, db } = setup();
    await service.createItem(
      'admin',
      'list',
      { gameId: 'game', orderKey: '0|000001:' },
      true,
    );
    expect(db.createRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'list_items', permissions: [] }),
    );
    expect(db.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'lists',
        transactionId: 'tx',
        data: { revision: expect.not.stringMatching(/^r1$/) as unknown },
      }),
    );
  });
  it.each(['draft', 'published', 'archived'])(
    'rejects non-admin writes in %s',
    async (status) => {
      const { service, db } = setup(status);
      await expect(
        service.createItem('user', 'list', { gameId: 'game', orderKey: 'a' }),
      ).rejects.toThrow();
      expect(db.createRow).not.toHaveBeenCalled();
    },
  );
  it.each(['published', 'archived'])(
    'requires returning %s lists to draft before admin edits',
    async (status) => {
      const { service, db } = setup(status);
      await expect(
        service.updateList('admin', 'list', { title: 'Change' }, true),
      ).rejects.toThrow('rascunho');
      expect(db.updateRow).not.toHaveBeenCalled();
    },
  );
  it.each([true, false])(
    'forwards the authenticated admin label to all existing item routes: %s',
    (isAdmin) => {
      const service = {
        createItem: jest.fn(),
        updateItem: jest.fn(),
        deleteItem: jest.fn(),
      };
      const controller = new SocialController(
        service as unknown as SocialService,
      );
      const req = { user: { $id: 'user', labels: isAdmin ? ['admin'] : [] } };
      void controller.item(req, 'list', { gameId: 'game', orderKey: 'a' });
      void controller.updateItem(req, 'list', 'item', { orderKey: 'b' });
      void controller.deleteItem(req, 'list', 'item');
      expect(service.createItem).toHaveBeenCalledWith(
        'user',
        'list',
        { gameId: 'game', orderKey: 'a' },
        isAdmin,
      );
      expect(service.updateItem).toHaveBeenCalledWith(
        'user',
        'list',
        'item',
        { orderKey: 'b' },
        isAdmin,
      );
      expect(service.deleteItem).toHaveBeenCalledWith(
        'user',
        'list',
        'item',
        isAdmin,
      );
    },
  );
});
