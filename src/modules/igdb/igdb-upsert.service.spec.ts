import { IGDBUpsertService } from './igdb-upsert.service';
import { buildSearchDocument } from '../game/game-search.utils';

describe('IGDBUpsertService search metadata', () => {
  it('retains aliases across partial webhook updates and rebuilds renamed titles', async () => {
    const tablesDB = {
      createRow: jest.fn().mockRejectedValue({ code: 409 }),
      listRows: jest.fn().mockResolvedValue({
        rows: [
          {
            $id: 'igdb_1',
            checksum: 'old',
            involvedCompanies: [],
            searchAliases: ['Biohazard'],
          },
        ],
      }),
      updateRow: jest.fn().mockResolvedValue({}),
    };
    const service = new IGDBUpsertService({ tablesDB } as never, {} as never);
    await service.upsertGameRow({
      name: 'Resident Evil Remastered',
      slug: 'resident-evil-remastered',
      externalReference: 1,
      checksum: 'new',
      ...buildSearchDocument('Resident Evil Remastered'),
      searchAliases: undefined,
    });
    const data = tablesDB.updateRow.mock.calls[0][0].data;
    expect(data.searchAliases).toEqual(['Biohazard']);
    expect(data.searchText).toContain(Buffer.from('biohazard').toString('hex'));
    expect(data.searchName).toBe('resident evil remastered');
  });
  it('does not let an unchanged checksum suppress the search_ready to full transition', async () => {
    const db = {
      createRow: jest.fn().mockRejectedValue({ code: 409 }),
      listRows: jest
        .fn()
        .mockResolvedValue({
          rows: [
            {
              $id: 'igdb_1',
              checksum: 'same',
              syncStage: 'search_ready',
              involvedCompanies: [],
            },
          ],
        }),
      updateRow: jest.fn(),
    };
    const service = new IGDBUpsertService(
      { tablesDB: db } as never,
      {} as never,
    );
    await service.upsertGameRow({
      name: 'Game',
      slug: 'game',
      externalReference: 1,
      checksum: 'same',
      syncStage: 'full' as never,
    });
    expect(db.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncStage: 'full' }),
      }),
    );
  });
});
