jest.mock('src/infra/appwrite/constants', () => ({
  ENDPOINT: 'https://example.test/v1',
  PROJECT_ID: 'test-project',
}));
import {
  ComparisonSessionReader,
  ProfileComparisonService,
} from './profile-comparison.service';
import { ProfileComparisonQuery } from './profile-comparison.dto';

const row = (id: string, data: Record<string, unknown>) => ({
  $id: id,
  $updatedAt: '2026-01-01',
  ...data,
});
function fixture(extra: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    user_profiles: [
      row('me', { userId: 'user', gamertag: 'Me', fingerprint: 'own' }),
      row('peer', {
        userId: 'other-user',
        gamertag: 'Peer',
        fingerprint: 'peer',
      }),
    ],
    z_entries_read: [],
    ratings: [],
    games: [],
    ...extra,
  };
  const listRows = jest.fn(async ({ tableId, queries }) => {
    // Simulate the session-bound Appwrite response: inaccessible rows are absent before all counting/pagination.
    let rows = tables[tableId].filter((r) => !r.inaccessible);
    for (const raw of queries) {
      const query = JSON.parse(raw);
      if (query.method === 'equal')
        rows = rows.filter((r) => query.values.includes(r[query.attribute]));
      if (query.method === 'cursorAfter')
        rows = rows.filter((r) => r.$id > query.values[0]);
    }
    rows.sort((a, b) => a.$id.localeCompare(b.$id));
    return { rows: rows.slice(0, 100), total: rows.length };
  });
  const create = jest.fn(() => ({ listRows }));
  return {
    service: new ProfileComparisonService({ create } as any),
    listRows,
    create,
    tables,
  };
}
const entries = (owner: string, ...games: string[]) =>
  games.map((id) =>
    row(`${owner}-${id}`, {
      ownerFingerprint: owner,
      gameId: id,
      status: 'completed',
    }),
  );
const rating = (owner: string, game: string, value: number) =>
  row(`${owner}-${game}`, {
    ownerFingerprint: owner,
    gameId: game,
    rating: value,
  });
const game = (id: string, name = id) => row(id, { name, slug: id });

describe('ProfileComparisonService', () => {
  it('uses a JWT client with no administrative API key', () => {
    const db = new ComparisonSessionReader().create('visitor-jwt') as any;
    expect(db.client.config.jwt).toBe('visitor-jwt');
    expect(db.client.config.key).toBeFalsy();
    expect(() => new ComparisonSessionReader().create('')).toThrow(
      'Sessão necessária',
    );
  });

  it('deduplicates common games by latest status and represents missing/invalid ratings as null', async () => {
    const { service, create } = fixture({
      z_entries_read: [
        ...entries('own', 'a'),
        ...entries('peer', 'a'),
        row('duplicate', {
          ownerFingerprint: 'peer',
          gameId: 'a',
          status: 'playing',
          $updatedAt: '2026-02-01',
        }),
      ],
      ratings: [rating('own', 'a', 0), rating('peer', 'a', 5)],
      games: [game('a')],
    });
    const result = await service.compare(
      'user',
      'jwt',
      'Peer',
      new ProfileComparisonQuery(),
    );
    expect(create).toHaveBeenCalledWith('jwt');
    expect(result.total).toBe(1);
    expect(result.rows[0].me.rating).toBeNull();
    expect(result.rows[0].other).toEqual({ status: 'playing', rating: 5 });
  });

  it('sorts opinion differences both ways with stable title/ID ties and no zero ratings', async () => {
    const { service } = fixture({
      ratings: [
        rating('own', 'a', 4),
        rating('peer', 'a', 4),
        rating('own', 'b', 1),
        rating('peer', 'b', 5),
        rating('own', 'c', 4),
        rating('peer', 'c', 4),
        rating('own', 'invalid', 0),
        rating('peer', 'invalid', 5),
      ],
      games: [
        game('a', 'Same'),
        game('b', 'Other'),
        game('c', 'Same'),
        game('invalid'),
      ],
    });
    const query = Object.assign(new ProfileComparisonQuery(), {
      view: 'opinions',
      limit: 2,
    });
    const first = await service.compare('user', 'jwt', 'Peer', query);
    const second = await service.compare('user', 'jwt', 'Peer', {
      ...query,
      offset: 2,
    });
    expect(first.rows.map((r) => r.game.id)).toEqual(['a', 'c']);
    expect(second.rows.map((r) => r.game.id)).toEqual(['b']);
    expect(first.total).toBe(3);
    const different = await service.compare('user', 'jwt', 'Peer', {
      ...query,
      order: 'different',
    });
    expect(different.rows[0].game.id).toBe('b');
  });

  it('excludes existing/wishlisted titles and inaccessible ratings/games before totals', async () => {
    const { service } = fixture({
      z_entries_read: [
        row('wish', {
          ownerFingerprint: 'own',
          gameId: 'a',
          status: 'wishlist',
        }),
      ],
      ratings: [
        rating('peer', 'a', 5),
        rating('peer', 'b', 4),
        { ...rating('peer', 'private', 5), inaccessible: true },
        rating('peer', 'hidden-game', 5),
      ],
      games: [
        game('a'),
        game('b'),
        game('private'),
        { ...game('hidden-game'), inaccessible: true },
      ],
    });
    const result = await service.compare('user', 'jwt', 'Peer', {
      ...new ProfileComparisonQuery(),
      view: 'discoveries',
    });
    expect(result.total).toBe(1);
    expect(result.rows.map((r) => r.game.id)).toEqual(['b']);
  });

  it('handles empty libraries and rejects self or unavailable profiles', async () => {
    const { service, tables } = fixture();
    expect(
      (
        await service.compare(
          'user',
          'jwt',
          'Peer',
          new ProfileComparisonQuery(),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      service.compare('user', 'jwt', 'Me', new ProfileComparisonQuery()),
    ).rejects.toThrow('outro jogador');
    tables.user_profiles[1].inaccessible = true;
    await expect(
      service.compare('user', 'jwt', 'Peer', new ProfileComparisonQuery()),
    ).rejects.toThrow('indisponível');
  });

  it('reads all server pages before sorting and slices without repeated titles', async () => {
    const ids = Array.from({ length: 105 }, (_, i) =>
      String(i).padStart(3, '0'),
    );
    const { service, listRows } = fixture({
      z_entries_read: [...entries('own', ...ids), ...entries('peer', ...ids)],
      games: ids.map((id) => game(id)),
    });
    const first = await service.compare('user', 'jwt', 'Peer', {
      ...new ProfileComparisonQuery(),
      limit: 50,
    });
    const second = await service.compare('user', 'jwt', 'Peer', {
      ...new ProfileComparisonQuery(),
      limit: 50,
      offset: 50,
    });
    expect(first.total).toBe(105);
    expect(
      new Set([...first.rows, ...second.rows].map((r) => r.game.id)).size,
    ).toBe(100);
    expect(
      listRows.mock.calls.some(([args]) =>
        args.queries.some(
          (query: string) => JSON.parse(query).method === 'cursorAfter',
        ),
      ),
    ).toBe(true);
  });
});
