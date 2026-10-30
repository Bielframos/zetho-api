import { CacheModule } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { AppwriteException } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { ListsService } from './lists.service';
import { ListsModule } from './lists.module';
import { editorialDraftSchema } from './list-editorial.schema';
import { listReadPermissions } from './list-policy';

type Row = { $id: string; [key: string]: any };
type Args = {
  tableId: string;
  rowId: string;
  data?: Record<string, unknown>;
  permissions?: string[];
  transactionId?: string;
};
const thematic = {
  title: 'Jogos para descobrir',
  description: 'Uma seleção editorial temática.',
  criteria: 'Seleção subjetiva pela proposta e variedade de experiências.',
  kind: 'thematic',
  items: [
    {
      gameId: 'g1',
      reason: 'Uma proposta para explorar em grupo.',
      sources: ['https://publisher.example/game'],
    },
  ],
};
const admin = { $id: 'editor', labels: ['admin'] };
function setup() {
  let rows = new Map<string, Row>([
    [
      'games/g1',
      {
        $id: 'g1',
        name: 'Catalog game',
        slug: 'catalog-game',
        releaseDate: '2026-10-15T00:00:00.000Z',
      },
    ],
  ]);
  const write = (args: Args) => {
    const key = `${args.tableId}/${args.rowId}`;
    const row = {
      ...rows.get(key),
      $id: args.rowId,
      ...args.data,
      ...(args.permissions ? { $permissions: args.permissions } : {}),
    };
    rows.set(key, row);
    return Promise.resolve(row);
  };
  const db = {
    getTable: jest
      .fn()
      .mockResolvedValue({ $permissions: [], rowSecurity: true }),
    createRow: jest.fn(write),
    updateRow: jest.fn(write),
    upsertRow: jest.fn(write),
    deleteRow: jest.fn((a: Args) => {
      rows.delete(`${a.tableId}/${a.rowId}`);
      return Promise.resolve();
    }),
    getRow: jest.fn((a: Args) => {
      const row = rows.get(`${a.tableId}/${a.rowId}`);
      return row
        ? Promise.resolve(row)
        : Promise.reject(new AppwriteException('Not found', 404));
    }),
    listRows: jest.fn(
      ({ tableId, queries = [] }: { tableId: string; queries?: string[] }) => {
        let found = [...rows.entries()]
          .filter(([key]) => key.startsWith(`${tableId}/`))
          .map(([, row]) => row);
        for (const raw of queries) {
          const q = JSON.parse(raw) as {
            method: string;
            attribute: string;
            values: unknown[];
          };
          if (q.method === 'equal')
            found = found.filter((r) =>
              q.values.includes(
                typeof r[q.attribute] === 'object'
                  ? (r[q.attribute] as { $id: string }).$id
                  : r[q.attribute],
              ),
            );
        }
        return Promise.resolve({ rows: found, total: found.length });
      },
    ),
  };
  const transactions = {
    runInTransaction: async <T>(
      work: (ctx: { txId: string }) => Promise<T>,
    ) => {
      const snapshot = new Map(rows);
      try {
        return await work({ txId: 'tx' });
      } catch (e) {
        rows = snapshot;
        throw e;
      }
    },
  };
  return {
    db,
    transactions,
    service: new ListsService(
      { tablesDB: db } as unknown as Appwrite,
      transactions as TransactionService,
    ),
    rows: () => rows,
  };
}

describe('Unified list lifecycle', () => {
  it('creates private drafts in lists/items and restricts read and publication to admins', async () => {
    const { service, db } = setup();
    const row = await service.submit(thematic);
    expect(row).toMatchObject({
      ownerType: 'system',
      status: 'draft',
      $permissions: [],
    });
    expect(db.createRow.mock.calls.map(([a]) => a.tableId)).toEqual([
      'lists',
      'list_items',
    ]);
    await expect(service.byId(row.$id)).rejects.toThrow();
    await expect(
      service.listItems(row.$id, { $id: 'visitor' }),
    ).rejects.toThrow();
    await expect(
      service.setStatus({ $id: 'visitor' }, row.$id, {
        status: 'published',
        revision: row.revision,
        sourcesVerified: true,
      }),
    ).rejects.toThrow();
    expect((await service.detail(row.slug, admin)).$id).toBe(row.$id);
    expect((await service.listItems(row.$id, admin)).total).toBe(1);
  });
  it('refuses drafts until table-wide public permissions are removed', async () => {
    const { service, db } = setup();
    db.getTable.mockResolvedValue({
      $permissions: ['read("any")'],
      rowSecurity: true,
    });
    await expect(service.submit(thematic)).rejects.toThrow('permissões');
    expect(db.createRow).not.toHaveBeenCalled();
  });
  it('requires review of the exact revision and preserves IDs across publication and archival', async () => {
    const { service, rows } = setup();
    const row = await service.submit(thematic);
    const ids = [...rows().keys()];
    await expect(
      service.setStatus(admin, row.$id, {
        status: 'published',
        revision: 'old',
        sourcesVerified: true,
      }),
    ).rejects.toThrow();
    await expect(
      service.setStatus(admin, row.$id, {
        status: 'published',
        revision: row.revision,
      }),
    ).rejects.toThrow();
    await service.setStatus(admin, row.$id, {
      status: 'published',
      revision: row.revision,
      sourcesVerified: true,
    });
    expect((await service.byId(row.$id)).$permissions).toEqual(['read("any")']);
    expect((await service.listItems(row.$id)).total).toBe(1);
    await expect(
      service.revise(admin, row.$id, row.revision, thematic),
    ).rejects.toThrow();
    await service.setStatus(admin, row.$id, {
      status: 'archived',
      revision: row.revision,
    });
    await expect(service.byId(row.$id)).rejects.toThrow();
    expect([...rows().keys()]).toEqual(ids);
    expect(rows().get(`lists/${row.$id}`)?.$permissions).toEqual([]);
  });
  it('retains item IDs when revising and invalidates previous source approvals', async () => {
    const { service, rows } = setup();
    const row = await service.submit(thematic);
    const itemId = [...rows().keys()].find((k) => k.startsWith('list_items/'));
    const revised = await service.revise(admin, row.$id, row.revision, {
      ...thematic,
      title: 'Outra seleção de jogos',
    });
    expect(revised.revision).not.toBe(row.revision);
    expect(rows().has(itemId!)).toBe(true);
    await expect(
      service.setStatus(admin, row.$id, {
        status: 'published',
        revision: row.revision,
        sourcesVerified: true,
      }),
    ).rejects.toThrow();
  });
  it('rolls back partial item creation', async () => {
    const { service, db, rows } = setup();
    db.createRow
      .mockImplementationOnce((a) => Promise.resolve({ $id: a.rowId }))
      .mockRejectedValueOnce(new Error('failed item'));
    await expect(service.submit(thematic)).rejects.toThrow('failed item');
    expect([...rows().keys()]).toEqual(['games/g1']);
  });
  it('rejects invented games, missing sources, conflicting dates and instructions', async () => {
    const { service, db } = setup();
    expect(
      editorialDraftSchema.safeParse({ ...thematic, publish: true }).success,
    ).toBe(false);
    expect(
      editorialDraftSchema.safeParse({
        ...thematic,
        items: [{ ...thematic.items[0], sources: [] }],
      }).success,
    ).toBe(false);
    await expect(
      service.submit({
        ...thematic,
        kind: 'monthly',
        month: '2026-10',
        items: [{ ...thematic.items[0], releaseDate: '2026-10-20' }],
      }),
    ).rejects.toThrow('Data ausente');
    await expect(
      service.submit({
        ...thematic,
        items: [{ ...thematic.items[0], gameId: 'missing' }],
      }),
    ).rejects.toThrow();
    expect(db.createRow).not.toHaveBeenCalled();
  });
  it('escapes post prose, withdraws the post with its list and creates a new post per revision', async () => {
    const { service } = setup();
    const row = await service.submit({
      ...thematic,
      kind: 'monthly',
      month: '2026-10',
      items: [
        {
          ...thematic.items[0],
          releaseDate: '2026-10-15',
          reason: '<script>steal()</script> proposta editorial',
        },
      ],
    });
    await service.setStatus(admin, row.$id, {
      status: 'published',
      revision: row.revision,
      sourcesVerified: true,
    });
    const post = await service.convert(admin, row.$id);
    expect(post.status).toBe('draft');
    expect(post.body).not.toContain('<script>');
    expect(post.body).toContain('/listas/');
    await service.publishPost(admin, row.$id, row.revision);
    const next = await service.setStatus(admin, row.$id, {
      status: 'draft',
      revision: row.revision,
    });
    expect(next.revision).not.toBe(row.revision);
    await expect(
      service.publishPost(admin, row.$id, row.revision),
    ).rejects.toThrow();
    await service.setStatus(admin, row.$id, {
      status: 'published',
      revision: next.revision,
      sourcesVerified: true,
    });
    const newPost = await service.convert(admin, row.$id);
    expect(newPost.$id).not.toBe(post.$id);
  });
  it('preserves private owner access without granting it to other users', async () => {
    const { service, rows } = setup();
    rows().set('lists/p', {
      $id: 'p',
      ownerType: 'user',
      ownerFingerprint: 'fp',
      isPublic: false,
      status: 'published',
    });
    rows().set('user_profiles/p', {
      $id: 'p',
      userId: 'owner',
      fingerprint: 'fp',
    });
    expect((await service.byId('p', { $id: 'owner' })).$id).toBe('p');
    await expect(service.byId('p', { $id: 'other' })).rejects.toThrow();
    expect(
      listReadPermissions(
        { ownerType: 'user', isPublic: false, status: 'published' },
        'owner',
      ),
    ).toEqual(['read("user:owner")']);
  });
  it('resolves the real feature module with its global infrastructure', async () => {
    const { db, transactions } = setup();
    @Global()
    @Module({
      providers: [
        { provide: Appwrite, useValue: { tablesDB: db } },
        { provide: TransactionService, useValue: transactions },
      ],
      exports: [Appwrite, TransactionService],
    })
    class Infra {}
    const module = await Test.createTestingModule({
      imports: [CacheModule.register({ isGlobal: true }), Infra, ListsModule],
    }).compile();
    expect(module.get(ListsService)).toBeDefined();
    await module.close();
  });
});
