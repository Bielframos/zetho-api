import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ProfileEntriesQuery } from './profile-entries.dto';
import { ProfileEntriesService } from './profile-entries.service';

describe('ProfileEntriesService', () => {
  let entries: any[];
  let games: any[];
  const listRows = jest.fn();
  const service = new ProfileEntriesService({
    tablesDB: { listRows },
  } as never);
  const query = (options: Partial<ProfileEntriesQuery> = {}) =>
    Object.assign(new ProfileEntriesQuery(), { group: 'release-year' }, options);
  const entry = (id: string, date: string | null = '2026-01-01T00:00:00Z') => ({
    $id: id,
    gameId: id,
    ownerFingerprint: 'owner',
    status: 'completed',
    $createdAt: '2020-01-01T00:00:00Z',
    $updatedAt: '2026-09-01T00:00:00Z',
    statusChangedAt: date,
  });
  const game = (id: string, name: string, year: string | null = '2025') => ({
    $id: id,
    name,
    slug: id,
    releaseYear: year,
  });

  beforeEach(() => {
    entries = [];
    games = [];
    listRows.mockReset().mockImplementation(({ tableId, queries }) => {
      const parsed = queries.map((q: string) => JSON.parse(q));
      const equals = (field: string) =>
        parsed.find((q: any) => q.method === 'equal' && q.attribute === field)
          ?.values;
      if (tableId === 'games') {
        return { rows: games.filter((g) => equals('$id').includes(g.$id)) };
      }
      const cursor = parsed.find((q: any) => q.method === 'cursorAfter')
        ?.values[0];
      const start = cursor ? entries.findIndex((e) => e.$id === cursor) + 1 : 0;
      const filtered = entries.filter(
        (e) =>
          equals('ownerFingerprint').includes(e.ownerFingerprint) &&
          equals('status').includes(e.status),
      );
      return {
        rows: filtered.slice(start, start + 100),
        total: filtered.length,
      };
    });
  });

  it('sorts the entire library before paging, including entries beyond the first database batch', async () => {
    entries = Array.from({ length: 105 }, (_, i) => entry(String(i)));
    games = entries.map((e, i) => game(e.gameId, `Game ${104 - i}`));
    const first = await service.list('owner', query());
    const second = await service.list('owner', query({ offset: 32 }));
    expect(first.total).toBe(105);
    expect(first.rows).toHaveLength(32);
    expect(first.rows[0].game.name).toBe('Game 0');
    expect(first.rows[31].game.name).toBe('Game 31');
    expect(second.rows[0].game.name).toBe('Game 32');
    expect(
      new Set([...first.rows, ...second.rows].map((e) => e.$id)).size,
    ).toBe(64);
    expect(first.rows.every((e) => e.groupKey === '2025')).toBe(true);
  });

  it('sorts release years newest first, names within years, and unknown years last', async () => {
    entries = ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id));
    games = [
      game('a', 'Zelda', '2026'),
      game('b', 'Álpha', '2026'),
      game('c', 'Before', '2025'),
      game('d', 'Unknown', null),
      { ...game('e', 'From date', null), releaseDate: '2027-01-01T00:00:00Z' },
    ];
    const result = await service.list(
      'owner',
      query({ group: 'release-year' }),
    );
    expect(result.rows.map((e) => e.$id)).toEqual(['e', 'b', 'a', 'c', 'd']);
    expect(result.rows.at(-1)?.groupKey).toBe('unknown');
  });

  it('groups accented names with their letter, keeps symbols in #, and breaks ties by entry ID', async () => {
    entries = ['z', 'a2', 'symbol', 'a1', 'number'].map((id) => entry(id));
    games = [
      game('z', 'Zelda'),
      game('a2', 'Álpha'),
      game('a1', 'alpha'),
      game('symbol', '!Game'),
      game('number', '007'),
    ];
    const result = await service.list(
      'owner',
      query({ group: 'alphabetical' }),
    );
    expect(result.rows.slice(0, 3).map((e) => [e.$id, e.groupKey])).toEqual([
      ['a1', 'A'],
      ['a2', 'A'],
      ['z', 'Z'],
    ]);
    expect(result.rows.slice(3).every((e) => e.groupKey === '#')).toBe(true);
  });

  it('retains recent-update ordering in ungrouped mode and filters owner/status', async () => {
    entries = [
      entry('old'),
      { ...entry('new'), $updatedAt: '2026-09-22T00:00:00Z' },
      { ...entry('foreign'), ownerFingerprint: 'someone-else' },
      { ...entry('playing'), status: 'playing' },
    ];
    games = entries.map((e) => game(e.gameId, e.gameId));
    const result = await service.list('owner', query({ group: 'none' }));
    expect(result.rows.map((e) => e.$id)).toEqual(['new', 'old']);
    expect(result.rows.every((e) => e.groupKey === 'all')).toBe(true);
  });

  it('omits deleted games from rows and total and handles an empty library', async () => {
    entries = [entry('removed')];
    expect(await service.list('owner', query())).toEqual({
      rows: [],
      total: 0,
    });
    entries = [];
    listRows.mockClear();
    expect(await service.list('owner', query())).toEqual({
      rows: [],
      total: 0,
    });
    expect(listRows).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid fingerprint before querying', async () => {
    await expect(service.list('invalid/value', query())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(listRows).not.toHaveBeenCalled();
  });
});

describe('ProfileEntriesQuery validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const transform = (value: object) =>
    pipe.transform(value, { type: 'query', metatype: ProfileEntriesQuery });

  it('defaults missing options and accepts numeric query strings', async () => {
    expect(await transform({})).toEqual(new ProfileEntriesQuery());
    expect((await transform({})).group).toBe('none');
    expect(await transform({ limit: '50', offset: '32' })).toMatchObject({
      limit: 50,
      offset: 32,
    });
  });

  it.each([
    { status: 'anything' },
    { group: 'anything' },
    { group: 'registered-year' },
    { limit: '0' },
    { limit: '101' },
    { offset: '-1' },
    { offset: '1.5' },
    { offset: 'abc' },
    { unexpected: 'value' },
  ])('rejects malformed pagination or unknown options: %j', async (value) => {
    await expect(transform(value)).rejects.toBeInstanceOf(BadRequestException);
  });
});
