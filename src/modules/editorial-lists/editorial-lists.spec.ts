import { EditorialListsService } from './editorial-lists.service';
import { editorialDraftSchema } from './editorial-list.schema';

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
    let draft: any;
    const db = {
      createRow: jest.fn(async ({ tableId, rowId, data }) => {
        const row = { $id: rowId, ...data };
        if (tableId === 'editorial_drafts') draft = row;
        return row;
      }),
      getRow: jest.fn(async ({ tableId, rowId }) => {
        if (tableId === 'editorial_drafts') return draft;
        if (tableId === 'games')
          return {
            $id: rowId,
            name: 'Catalog game',
            slug: 'catalog-game',
            releaseDate: '2026-10-15T00:00:00.000Z',
          };
        throw { code: 404 };
      }),
      updateRow: jest.fn(async ({ data }) => {
        draft = { ...draft, ...data };
        return draft;
      }),
      upsertRow: jest.fn(),
    };
    const service = new EditorialListsService(
      { tablesDB: db } as any,
      { runInTransaction: async (work: any) => work({ txId: 'tx' }) } as any,
    );
    return { service, db };
  }
  it('keeps agent output private and denies non-admin approval', async () => {
    const { service, db } = setup();
    const row: any = await service.submit(thematic);
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
    const row: any = await service.submit(thematic);
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
    expect(db.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'lists',
        data: expect.objectContaining({
          ownerFingerprint: 'system:zetho',
          isPublic: true,
        }),
      }),
    );
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
    const row: any = await service.submit({
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
    const post: any = await service.convert(admin, row.$id);
    expect(post.status).toBe('draft');
    expect(post.body).not.toContain('<script>');
    expect(post.body).toContain('2026-10');
    expect(db.createRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'posts', rowId: `ed-${row.$id}` }),
    );
  });
});
