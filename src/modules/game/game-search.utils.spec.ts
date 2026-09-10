import {
  buildSearchFields,
  companySearchFields,
  extractKeywords,
} from './game-search.utils';

describe('game search indexing', () => {
  it.each([
    ['F.E.A.R.', 'fear'],
    ['Grand Theft Auto V', 'gta'],
    ['God of War: Ragnarök', 'gow'],
    ['The Last of Us Part II', 'tlou'],
    ['The Legend of Zelda: Breath of the Wild', 'loz'],
    ['The Legend of Zelda: Breath of the Wild', 'botw'],
    ['Counter-Strike 2', 'counter'],
    ['Pokémon', 'poke'],
  ])('%s is found by %s', (title, query) => {
    const { searchTerms } = buildSearchFields(title);
    expect(
      extractKeywords(query).every((term) => searchTerms.includes(term)),
    ).toBe(true);
  });
  it('indexes community aliases supplied by the catalog', () => {
    expect(
      buildSearchFields('Resident Evil', ['Biohazard']).searchTerms,
    ).toContain('biohazard');
  });
  it('does not match arbitrary substrings', () => {
    expect(buildSearchFields('Saturday').searchTerms).not.toContain('gta');
  });
  it('separates company roles and preserves missing metadata', () => {
    expect(companySearchFields({})).toEqual({});
    expect(
      companySearchFields({
        involved_companies: [
          { company: { id: 1 }, developer: true },
          { company: { id: 2 }, publisher: true },
        ],
      }),
    ).toEqual({ developerIds: ['igdb_1'], publisherIds: ['igdb_2'] });
  });
});
