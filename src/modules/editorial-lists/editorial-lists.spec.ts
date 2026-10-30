import { AppwriteException } from 'node-appwrite';
import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { TransactionService } from 'src/infra/appwrite/transaction.service';
import { EditorialListsService } from './editorial-lists.service';
import { editorialDraftSchema } from './editorial-list.schema';

type MockRow = { $id: string; [key: string]: unknown };
type ReadArgs = { tableId: string; rowId: string };
type WriteArgs = ReadArgs & {
  data: Record<string, unknown>;
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
describe('Editorial lists review boundary', () => {
  const admin = { $id: 'editor', labels: ['admin'] };
  function setup() {
    let draft: MockRow = { $id: '' };
    const db = {
      createRow: jest.fn(({ tableId, rowId, data }: WriteArgs) => {
        const row = { $id: rowId, ...data };
        if (tableId === 'editorial_drafts') draft = row;
        return Promise.resolve(row);
      }),
      getRow: jest.fn(({ tableId, rowId }: ReadArgs) => {
        if (tableId === 'editorial_drafts') return Promise.resolve(draft);
        if (tableId === 'games')
          return Promise.resolve({
            $id: rowId,
            name: 'Catalog game',
            slug: 'catalog-game',
            releaseDate: '2026-10-15T00:00:00.000Z',
          });
        return Promise.reject(new AppwriteException('Not found', 404));
      }),
      updateRow: jest.fn(({ data }: WriteArgs) => {
        draft = { ...draft, ...data };
        return Promise.resolve(draft);
      }),
      upsertRow: jest.fn(),
    };
    const service = new EditorialListsService(
      { tablesDB: db } as unknown as Appwrite,
      {
        runInTransaction: <T>(work: (ctx: { txId: string }) => Promise<T>) =>
          work({ txId: 'tx' }),
      } as TransactionService,
    );
    return { service, db };
  }
  it('keeps agent output private and denies non-admin approval', async () => {
    const { service, db } = setup();
    const row = await service.submit(thematic);
    expect(db.createRow).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('draft');
    await expect(service.publicList(`zetho-${row.$id}`)).rejects.toThrow();
    await expect(
      service.approve({ $id: 'visitor', labels: [] }, row.$id, {
        revision: row.revision,
        sourcesVerified: true,
      }),
    ).rejects.toThrow();
    expect(db.createRow).toHaveBeenCalledTimes(1);
  });
  it('requires exact revision and explicit source review, then reuses lists/items', async () => {
    const { service, db } = setup();
    const row = await service.submit(thematic);
    await expect(
      service.approve(admin, row.$id, {
        revision: 'old',
        sourcesVerified: true,
      }),
    ).rejects.toThrow();
    await expect(
      service.approve(admin, row.$id, {
        revision: row.revision,
        sourcesVerified: false,
      }),
    ).rejects.toThrow();
    await service.approve(admin, row.$id, {
      revision: row.revision,
      sourcesVerified: true,
    });
    const listWrite = db.createRow.mock.calls.find(
      ([call]) => call.tableId === 'lists',
    )?.[0];
    expect(listWrite).toMatchObject({
      data: { ownerFingerprint: 'system:zetho', isPublic: true },
    });
    expect(db.createRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'list_items' }),
    );
    expect((await service.publicList(`zetho-${row.$id}`)).author).toBe('Zetho');
  });
  it('rejects invented IDs, missing sources, conflicting dates and model instructions', async () => {
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
    db.getRow.mockRejectedValueOnce({ code: 404 });
    await expect(service.submit(thematic)).rejects.toThrow('Jogo fora');
    expect(db.createRow).not.toHaveBeenCalled();
  });
  it('accepts a dated monthly fixture and escapes generated prose in the post', async () => {
    const { service, db } = setup();
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
    await service.approve(admin, row.$id, {
      revision: row.revision,
      sourcesVerified: true,
    });
    const post = await service.convert(admin, row.$id);
    expect(post.status).toBe('draft');
    expect(post.body).not.toContain('<script>');
    expect(post.body).toContain('2026-10');
    expect(db.createRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'posts', rowId: `ed-${row.$id}` }),
    );
  });
});
