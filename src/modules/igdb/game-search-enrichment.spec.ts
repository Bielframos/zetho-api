import { buildSearchPatch, SearchGameRow } from './game-search-enrichment';

describe('search enrichment preserves catalog data', () => {
  const existing = {
    $id: 'igdb_1',
    name: 'F.E.A.R.',
    slug: 'fear',
    externalReference: 1,
    syncStage: 'full',
    coverUrl: 'custom-cover',
    releaseYear: '2005',
    releaseDate: '2005-10-17T00:00:00Z',
    genres: ['igdb_5'],
    searchAliases: ['First Encounter Assault Recon'],
    developerIds: ['igdb_1'],
  } as SearchGameRow;
  it('patches discovery only and never downgrades a full game', () => {
    const patch = buildSearchPatch(existing, {
      id: 1,
      name: 'FEAR',
      cover: { image_id: 'new' },
      first_release_date: 1000,
      genres: [3],
      summary: 'replacement',
      alternative_names: [{ name: 'Fear' }],
    });
    expect(patch).toMatchObject({
      syncStage: 'full',
      searchName: 'fear',
      searchIndexVersion: 1,
    });
    expect(patch.searchAliases).toEqual([
      'First Encounter Assault Recon',
      'Fear',
    ]);
    for (const field of [
      'name',
      'slug',
      'summary',
      'summaryPt',
      'coverUrl',
      'genres',
      'releaseYear',
      'releaseDate',
      'involvedCompanies',
      'ratingCount',
      'developerIds',
    ])
      expect(patch).not.toHaveProperty(field);
  });
  it('fills absent cover, genres and release data, with separate company roles', () => {
    const patch = buildSearchPatch(
      {
        ...existing,
        syncStage: 'basic',
        coverUrl: null,
        genres: [],
        releaseYear: null,
        releaseDate: null,
      },
      {
        id: 1,
        name: 'F.E.A.R.',
        cover: { image_id: 'cover' },
        genres: [5],
        first_release_date: 1129507200,
        involved_companies: [
          {
            id: 3,
            company: { id: 7, name: 'Studio', slug: 'studio', checksum: 'a' },
            developer: true,
            publisher: true,
          },
        ],
      },
    );
    expect(patch).toMatchObject({
      syncStage: 'search_ready',
      developerIds: ['igdb_7'],
      publisherIds: ['igdb_7'],
      genres: ['igdb_5'],
      releaseYear: '2005',
    });
    expect(patch.coverUrl).toContain('/cover.jpg');
  });
});
