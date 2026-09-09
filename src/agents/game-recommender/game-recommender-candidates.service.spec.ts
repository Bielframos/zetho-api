/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { UnprocessableEntityException } from '@nestjs/common';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';

describe('GameRecommenderCandidatesService', () => {
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    $id: id,
    $createdAt: '2026-01-01T00:00:00.000Z',
    $updatedAt: '2026-09-01T00:00:00.000Z',
    name: id,
    slug: id,
    coverUrl: null,
    releaseYear: '2026',
    genres: ['action'],
    ratingAvg: 4,
    ratingCount: 100,
    hypes: 10,
    similarGames: [],
    ...overrides,
  });

  const parseQueries = (queries: string[]) =>
    queries.map((query) => JSON.parse(query) as Record<string, any>);

  function setup(options: {
    backlog?: string[];
    library?: string[];
    popular?: string[];
    recentRecommendationIds?: string[];
  }) {
    const games = new Map(
      [
        ...new Set([...(options.library ?? []), ...(options.popular ?? [])]),
      ].map((id) => [id, row(id)]),
    );
    const recentEntry = {
      $id: 'entry-signal',
      $updatedAt: '2026-09-08T00:00:00.000Z',
      gameId: 'signal',
      status: 'completed',
      liked: true,
      likedEver: true,
    };
    games.set(
      'signal',
      row('signal', { similarGames: options.popular?.slice(0, 1) ?? [] }),
    );

    const tablesDB = {
      listRows: jest.fn(async ({ tableId, queries }: any) => {
        const parsed = parseQueries(queries);
        const equal = (attribute: string, value?: string) =>
          parsed.some(
            (query) =>
              query.method === 'equal' &&
              query.attribute === attribute &&
              (value === undefined || query.values?.includes(value)),
          );
        const limit = parsed.find((query) => query.method === 'limit')
          ?.values?.[0];

        if (tableId === 'user_profiles') {
          return {
            total: 1,
            rows: [
              {
                $id: 'profile-1',
                userId: 'user-1',
                fingerprint: 'fp-1',
                zcoinBalance: 50,
              },
            ],
          };
        }
        if (tableId === 'game_recommendations') {
          return {
            total: options.recentRecommendationIds?.length ?? 0,
            rows: (options.recentRecommendationIds ?? []).map((gameId) => ({
              $id: `rec-${gameId}`,
              $createdAt: new Date().toISOString(),
              gameId,
            })),
          };
        }
        if (tableId === 'z_entries_read') {
          if (equal('status', 'backlog')) {
            const rows = (options.backlog ?? []).map((gameId) => ({
              $id: `entry-${gameId}`,
              gameId,
            }));
            return { total: rows.length, rows };
          }
          if (limit === 30) return { total: 1, rows: [recentEntry] };
          const ids = [...new Set(['signal', ...(options.library ?? [])])];
          return {
            total: ids.length,
            rows: ids.map((gameId) => ({ $id: `entry-${gameId}`, gameId })),
          };
        }
        if (tableId === 'games') {
          const idQuery = parsed.find(
            (query) => query.method === 'equal' && query.attribute === '$id',
          );
          const ids = idQuery?.values ?? options.popular ?? [];
          return {
            total: ids.length,
            rows: ids.flatMap((id: string) => {
              const game = games.get(id);
              return game ? [game] : [];
            }),
          };
        }
        return { total: 0, rows: [] };
      }),
    };
    const cacheData = new Map<string, unknown>();
    const cache = {
      get: jest.fn(async (key: string) => cacheData.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheData.set(key, value);
      }),
    };
    return {
      service: new GameRecommenderCandidatesService(
        { tablesDB } as never,
        cache as never,
      ),
      tablesDB,
      cache,
    };
  }

  it('library devolve somente jogos em backlog', async () => {
    const fixture = setup({
      backlog: ['backlog-1', 'backlog-2'],
      library: ['backlog-1', 'backlog-2'],
    });
    const result = await fixture.service.build('user-1', 'library');

    expect(
      result.candidates.map((candidate) => candidate.game.id).sort(),
    ).toEqual(['backlog-1', 'backlog-2']);
    expect(
      result.candidates.every((candidate) => candidate.source === 'library'),
    ).toBe(true);
  });

  it('new nunca devolve jogos existentes na biblioteca e limita o pool', async () => {
    const popular = Array.from(
      { length: 40 },
      (_, index) => `popular-${index}`,
    );
    const fixture = setup({
      library: ['popular-0'],
      popular,
    });
    const result = await fixture.service.build('user-1', 'new');

    expect(result.candidates).toHaveLength(24);
    expect(
      result.candidates.some((candidate) => candidate.game.id === 'popular-0'),
    ).toBe(false);
    expect(
      result.candidates.every((candidate) => candidate.source === 'new'),
    ).toBe(true);
  });

  it('any combina backlog e catálogo', async () => {
    const fixture = setup({
      backlog: ['backlog-1'],
      library: ['backlog-1'],
      popular: ['popular-1'],
    });
    const result = await fixture.service.build('user-1', 'any');

    expect(
      new Set(result.candidates.map((candidate) => candidate.source)),
    ).toEqual(new Set(['library', 'new']));
  });

  it('evita recomendação dos últimos 30 dias quando há alternativa', async () => {
    const fixture = setup({
      popular: ['popular-1', 'popular-2'],
      recentRecommendationIds: ['popular-1'],
    });
    const result = await fixture.service.build('user-1', 'new');

    expect(
      result.candidates.map((candidate) => candidate.game.id),
    ).not.toContain('popular-1');
    expect(result.candidates.map((candidate) => candidate.game.id)).toContain(
      'popular-2',
    );
  });

  it('retorna 422 para library sem backlog, sem consultar IA ou catálogo global', async () => {
    const fixture = setup({ backlog: [], library: [] });
    await expect(
      fixture.service.build('user-1', 'library'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const catalogCalls = fixture.tablesDB.listRows.mock.calls.filter(
      ([call]) => call.tableId === 'games',
    );
    // Só carrega os jogos de sinal; não varre nem carrega o pool popular.
    expect(catalogCalls).toHaveLength(1);
  });
});
