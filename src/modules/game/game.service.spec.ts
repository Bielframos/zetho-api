import { NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';

describe('GameService.findById', () => {
  const tablesDB = { listRows: jest.fn() };
  const appwrite = { tablesDB } as never;
  const cache = { get: jest.fn(), set: jest.fn() } as never;

  const buildService = () =>
    new GameService(appwrite, {} as never, {} as never, cache);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna o jogo pelo $id', async () => {
    tablesDB.listRows.mockResolvedValue({
      rows: [{ $id: 'g1', name: 'Hades II', slug: 'hades-ii' }],
    });

    const game = await buildService().findById('g1', 'name,slug');

    expect(game).toMatchObject({ $id: 'g1', name: 'Hades II' });
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1);
  });

  it('lança NotFoundException quando o id não existe', async () => {
    tablesDB.listRows.mockResolvedValue({ rows: [] });

    await expect(buildService().findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GameService.search', () => {
  const tablesDB = { listRows: jest.fn(), updateRow: jest.fn() };
  const igdb = { getGamesByIds: jest.fn() };
  const service = new GameService(
    { tablesDB } as never,
    {} as never,
    igdb as never,
    {} as never,
  );
  beforeEach(() => jest.clearAllMocks());
  it('returns empty for blank/punctuation-only searches without querying the catalog', async () => {
    expect((await service.search({ q: '!!!' })).results).toEqual([]);
    expect((await service.search({})).total).toBe(0);
    expect(tablesDB.listRows).not.toHaveBeenCalled();
  });
  it('fills the page after exact matches and applies every filter to both tiers', async () => {
    tablesDB.listRows
      .mockResolvedValueOnce({
        rows: [{ $id: 'fear', name: 'F.E.A.R.' }],
        total: 1,
      })
      .mockResolvedValueOnce({ rows: [{ $id: 'fear2' }], total: 4 });
    const result = await service.search({
      q: 'FEAR',
      pageSize: 2,
      developer: 'igdb_1',
      publisher: 'igdb_2',
      year: '2005',
    });
    expect(result).toMatchObject({ total: 5, pageCount: 3 });
    expect(result.results).toHaveLength(2);
    for (const [call] of tablesDB.listRows.mock.calls) {
      expect(call.queries.join(' ')).toContain(
        '646576656c6f7065723a696764625f31',
      );
      expect(call.queries.join(' ')).toContain(
        '7075626c69736865723a696764625f32',
      );
      expect(call.queries.join(' ')).toContain('releaseYear');
    }
    expect(igdb.getGamesByIds).not.toHaveBeenCalled();
    expect(tablesDB.updateRow).not.toHaveBeenCalled();
  });
  it('subtracts exact-tier total from subsequent-page offsets', async () => {
    tablesDB.listRows
      .mockResolvedValueOnce({ rows: [], total: 1 })
      .mockResolvedValueOnce({ rows: [{ $id: '2' }, { $id: '3' }], total: 4 });
    await service.search({ q: 'fear', pageSize: 2, page: 2 });
    const queries = tablesDB.listRows.mock.calls[1][0].queries.map(
      (q: string) => JSON.parse(q),
    );
    expect(queries).toContainEqual({ method: 'offset', values: [1] });
  });
  it('supports filters without a text query in one request', async () => {
    tablesDB.listRows.mockResolvedValue({ rows: [], total: 0 });
    await service.search({ publisher: 'igdb_2' });
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1);
  });
});

describe('GameService detail payload', () => {
  it('keeps the search index out of detail responses and their cache', async () => {
    const game = {
      $id: 'g1',
      name: 'F.E.A.R.',
      slug: 'fear',
      syncStage: 'full',
      zethoVersion: 2,
      searchText: 'internal encoded index',
      searchName: 'fear',
      searchIndexVersion: 1,
    };
    const tablesDB = {
      listRows: jest.fn().mockResolvedValue({ rows: [game] }),
    };
    const cache = { get: jest.fn(), set: jest.fn() };
    const service = new GameService(
      { tablesDB } as never,
      {} as never,
      {} as never,
      cache as never,
    );
    jest
      .spyOn(service, 'getSeoFlags')
      .mockResolvedValue({ indexable: false, textReviewCount: 0 });
    const result = await service.findBySlug('fear');
    expect(result).toMatchObject({ $id: 'g1', name: 'F.E.A.R.' });
    expect(result).not.toHaveProperty('searchText');
    expect(result).not.toHaveProperty('searchName');
    expect(cache.set.mock.calls[0][1]).not.toHaveProperty('searchText');
  });
});
