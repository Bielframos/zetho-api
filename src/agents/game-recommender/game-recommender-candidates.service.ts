import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Query } from 'node-appwrite';
import type {
  Games,
  UserProfiles,
  ZEntriesReadOnly,
} from 'src/infra/appwrite/appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type {
  GameRecommendationRow,
  PreferenceSignal,
  RecommendationCandidate,
  RecommendationContext,
  RecommendationScope,
  RecommendationSource,
  RecommenderGame,
} from './game-recommender.types';

type EntryRow = ZEntriesReadOnly & { $updatedAt: string };

@Injectable()
export class GameRecommenderCandidatesService {
  private static readonly DB_ID = 'app';
  private static readonly MAX_SIGNALS = 30;
  private static readonly MAX_CANDIDATES = 24;
  private static readonly MAX_BACKLOG_GAMES = 120;
  private static readonly POPULAR_POOL_SIZE = 96;
  private static readonly POPULAR_CACHE_TTL_MS = 15 * 60 * 1000;
  private static readonly RECENT_RECOMMENDATION_DAYS = 30;
  private static readonly GAME_FIELDS = [
    '$id',
    'name',
    'slug',
    'coverUrl',
    'releaseYear',
    'genres',
    'ratingAvg',
    'ratingCount',
    'hypes',
    'similarGames',
  ];

  constructor(
    private readonly appwrite: Appwrite,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async build(
    userId: string,
    scope: RecommendationScope,
  ): Promise<RecommendationContext> {
    const profile = await this.getProfile(userId);
    const recentEntries = await this.getRecentEntries(profile.fingerprint);
    const recentGames = await this.getGamesByIds(
      recentEntries.map((entry) => entry.gameId),
    );
    const recentGameMap = new Map(recentGames.map((game) => [game.id, game]));
    const signals = recentEntries
      .map((entry): PreferenceSignal | null => {
        const game = recentGameMap.get(entry.gameId);
        if (!game) return null;
        return {
          game,
          status: entry.status,
          liked: entry.liked,
          likedEver: entry.likedEver,
          updatedAt: entry.$updatedAt,
        };
      })
      .filter((signal): signal is PreferenceSignal => Boolean(signal));

    const [libraryCandidates, newCandidates, recommendationHistory] =
      await Promise.all([
        scope === 'new'
          ? Promise.resolve([])
          : this.getBacklogCandidates(profile.fingerprint),
        scope === 'library'
          ? Promise.resolve([])
          : this.getNewCandidates(profile.fingerprint, signals),
        this.getRecommendationHistory(userId),
      ]);

    if (scope === 'library' && libraryCandidates.length === 0) {
      throw new UnprocessableEntityException(
        'Não há jogos no backlog disponíveis para recomendar.',
      );
    }
    if (scope === 'new' && newCandidates.length === 0) {
      throw new UnprocessableEntityException(
        'Não há jogos novos disponíveis para recomendar.',
      );
    }

    const scoredLibrary = this.scoreCandidates(
      libraryCandidates,
      'library',
      signals,
    );
    const scoredNew = this.scoreCandidates(newCandidates, 'new', signals);
    const combined = this.combineByScope(scope, scoredLibrary, scoredNew);
    const candidates = this.avoidRecentRecommendations(
      combined,
      recommendationHistory,
    ).slice(0, GameRecommenderCandidatesService.MAX_CANDIDATES);

    if (candidates.length === 0) {
      throw new UnprocessableEntityException(
        'Não há candidatos disponíveis para recomendar.',
      );
    }

    return {
      profile: {
        id: profile.$id,
        userId: profile.userId,
        fingerprint: profile.fingerprint,
        balance: Number(profile.zcoinBalance ?? 0),
      },
      signals,
      candidates,
    };
  }

  async getGamesByIds(ids: string[]): Promise<RecommenderGame[]> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const games: RecommenderGame[] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const batch = uniqueIds.slice(index, index + 100);
      const page = await this.appwrite.tablesDB.listRows<Games>({
        databaseId: GameRecommenderCandidatesService.DB_ID,
        tableId: 'games',
        queries: [
          Query.equal('$id', batch),
          Query.limit(batch.length),
          Query.select(GameRecommenderCandidatesService.GAME_FIELDS),
        ],
      });
      games.push(...page.rows.map((game) => this.toGame(game)));
    }
    return games;
  }

  private async getProfile(userId: string): Promise<UserProfiles> {
    const page = await this.appwrite.tablesDB.listRows<UserProfiles>({
      databaseId: GameRecommenderCandidatesService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    const profile = page.rows[0];
    if (!profile) {
      throw new UnprocessableEntityException(
        'Crie seu perfil antes de solicitar uma recomendação.',
      );
    }
    return profile;
  }

  private async getRecentEntries(fingerprint: string): Promise<EntryRow[]> {
    const page = await this.appwrite.tablesDB.listRows<EntryRow>({
      databaseId: GameRecommenderCandidatesService.DB_ID,
      tableId: 'z_entries_read',
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.orderDesc('$updatedAt'),
        Query.limit(GameRecommenderCandidatesService.MAX_SIGNALS),
        Query.select([
          '$id',
          '$updatedAt',
          'gameId',
          'status',
          'liked',
          'likedEver',
        ]),
      ],
    });
    return page.rows;
  }

  private async getBacklogCandidates(
    fingerprint: string,
  ): Promise<RecommenderGame[]> {
    const page = await this.appwrite.tablesDB.listRows<EntryRow>({
      databaseId: GameRecommenderCandidatesService.DB_ID,
      tableId: 'z_entries_read',
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.equal('status', 'backlog'),
        Query.orderDesc('$updatedAt'),
        Query.limit(GameRecommenderCandidatesService.MAX_BACKLOG_GAMES),
        Query.select(['$id', 'gameId']),
      ],
    });
    return this.getGamesByIds(page.rows.map((entry) => entry.gameId));
  }

  private async getNewCandidates(
    fingerprint: string,
    signals: PreferenceSignal[],
  ): Promise<RecommenderGame[]> {
    const libraryIds = await this.getAllLibraryGameIds(fingerprint);
    const librarySet = new Set(libraryIds);
    const similarIds = [
      ...new Set(
        signals.flatMap((signal) => signal.game.similarGames).filter(Boolean),
      ),
    ].filter((id) => !librarySet.has(id));

    const [similarGames, popularGames] = await Promise.all([
      this.getGamesByIds(similarIds.slice(0, 100)),
      this.getPopularGames(),
    ]);

    const unique = new Map<string, RecommenderGame>();
    for (const game of [...similarGames, ...popularGames]) {
      if (!librarySet.has(game.id)) unique.set(game.id, game);
    }
    return [...unique.values()];
  }

  private async getAllLibraryGameIds(fingerprint: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const queries = [
        Query.equal('ownerFingerprint', fingerprint),
        Query.orderAsc('$id'),
        Query.limit(100),
        Query.select(['$id', 'gameId']),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.appwrite.tablesDB.listRows<EntryRow>({
        databaseId: GameRecommenderCandidatesService.DB_ID,
        tableId: 'z_entries_read',
        queries,
      });
      ids.push(...page.rows.map((entry) => entry.gameId));
      if (page.rows.length < 100) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }
    return ids;
  }

  private async getPopularGames(): Promise<RecommenderGame[]> {
    const cacheKey = 'game-recommender:popular-pool:v1';
    const cached = await this.cache.get<RecommenderGame[]>(cacheKey);
    if (cached) return cached;

    const page = await this.appwrite.tablesDB.listRows<Games>({
      databaseId: GameRecommenderCandidatesService.DB_ID,
      tableId: 'games',
      queries: [
        Query.orderDesc('ratingCount'),
        Query.limit(GameRecommenderCandidatesService.POPULAR_POOL_SIZE),
        Query.select(GameRecommenderCandidatesService.GAME_FIELDS),
      ],
    });
    const games = page.rows.map((game) => this.toGame(game));
    await this.cache.set(
      cacheKey,
      games,
      GameRecommenderCandidatesService.POPULAR_CACHE_TTL_MS,
    );
    return games;
  }

  private async getRecommendationHistory(
    userId: string,
  ): Promise<Array<{ gameId: string; createdAt: string }>> {
    const history: Array<{ gameId: string; createdAt: string }> = [];
    const cutoff = new Date(
      Date.now() -
        GameRecommenderCandidatesService.RECENT_RECOMMENDATION_DAYS *
          24 *
          60 *
          60 *
          1000,
    ).toISOString();
    let cursor: string | undefined;

    for (;;) {
      const queries = [
        Query.equal('userId', userId),
        Query.equal('state', 'completed'),
        Query.greaterThanEqual('$createdAt', cutoff),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
        Query.select(['$id', '$createdAt', 'gameId']),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>(
        {
          databaseId: GameRecommenderCandidatesService.DB_ID,
          tableId: 'game_recommendations',
          queries,
        },
      );
      history.push(
        ...page.rows.flatMap((row) =>
          row.gameId ? [{ gameId: row.gameId, createdAt: row.$createdAt }] : [],
        ),
      );
      if (page.rows.length < 100) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }
    return history;
  }

  private scoreCandidates(
    games: RecommenderGame[],
    source: RecommendationSource,
    signals: PreferenceSignal[],
  ): RecommendationCandidate[] {
    const genreWeights = new Map<string, number>();
    const similarWeights = new Map<string, number>();

    for (const signal of signals) {
      const weight = this.preferenceWeight(signal);
      for (const genre of signal.game.genres) {
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight);
      }
      for (const similarId of signal.game.similarGames) {
        similarWeights.set(
          similarId,
          (similarWeights.get(similarId) ?? 0) + weight * 1.6,
        );
      }
    }

    return games
      .map((game) => {
        const contributions = signals
          .map((signal) => ({
            id: signal.game.id,
            value: this.signalContribution(game, signal),
          }))
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
        const genreScore = game.genres.reduce(
          (sum, genre) => sum + (genreWeights.get(genre) ?? 0),
          0,
        );
        const score =
          genreScore * 1.8 +
          (similarWeights.get(game.id) ?? 0) +
          game.ratingAvg * 1.5 +
          Math.log10(game.ratingCount + 1) * 1.25 +
          Math.log10(game.hypes + 1) * 0.5 +
          (source === 'library' ? 0.3 : 0);
        return {
          game,
          source,
          score,
          basedOnGameIds: contributions.slice(0, 3).map((item) => item.id),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.game.ratingCount - a.game.ratingCount ||
          a.game.id.localeCompare(b.game.id),
      );
  }

  private combineByScope(
    scope: RecommendationScope,
    library: RecommendationCandidate[],
    fresh: RecommendationCandidate[],
  ) {
    if (scope === 'library') return library.slice(0, 24);
    if (scope === 'new') return fresh.slice(0, 24);

    const combined: RecommendationCandidate[] = [];
    const perSource = GameRecommenderCandidatesService.MAX_CANDIDATES / 2;
    combined.push(...library.slice(0, perSource), ...fresh.slice(0, perSource));

    if (combined.length < GameRecommenderCandidatesService.MAX_CANDIDATES) {
      const used = new Set(combined.map((candidate) => candidate.game.id));
      combined.push(
        ...[...library.slice(perSource), ...fresh.slice(perSource)]
          .filter((candidate) => !used.has(candidate.game.id))
          .sort(
            (a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id),
          )
          .slice(
            0,
            GameRecommenderCandidatesService.MAX_CANDIDATES - combined.length,
          ),
      );
    }
    return combined.sort(
      (a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id),
    );
  }

  private avoidRecentRecommendations(
    candidates: RecommendationCandidate[],
    history: Array<{ gameId: string; createdAt: string }>,
  ) {
    const lastRecommendation = new Map<string, number>();
    for (const item of history) {
      const time = Date.parse(item.createdAt);
      if (!lastRecommendation.has(item.gameId) && Number.isFinite(time)) {
        lastRecommendation.set(item.gameId, time);
      }
    }
    const cutoff =
      Date.now() -
      GameRecommenderCandidatesService.RECENT_RECOMMENDATION_DAYS *
        24 *
        60 *
        60 *
        1000;
    const fresh = candidates.filter(
      (candidate) => (lastRecommendation.get(candidate.game.id) ?? 0) < cutoff,
    );
    if (fresh.length > 0) return fresh;

    return [...candidates]
      .sort((a, b) => {
        const aTime = lastRecommendation.get(a.game.id) ?? 0;
        const bTime = lastRecommendation.get(b.game.id) ?? 0;
        return aTime - bTime || b.score - a.score;
      })
      .slice(0, 1);
  }

  private preferenceWeight(signal: PreferenceSignal) {
    let weight = 0;
    if (signal.status === 'playing') weight += 4;
    if (signal.status === 'completed') weight += 3;
    if (signal.status === 'backlog') weight += 0.5;
    if (signal.status === 'wishlist') weight += 1;
    if (signal.status === 'dropped') weight -= 4;
    if (signal.liked === true) weight += 5;
    if (signal.liked === false) weight -= 3;
    if (signal.likedEver === true && signal.liked !== true) weight += 2;
    return weight;
  }

  private signalContribution(
    candidate: RecommenderGame,
    signal: PreferenceSignal,
  ) {
    const preference = this.preferenceWeight(signal);
    if (preference <= 0) return preference;
    const overlap = candidate.genres.filter((genre) =>
      signal.game.genres.includes(genre),
    ).length;
    const similar = signal.game.similarGames.includes(candidate.id) ? 2 : 0;
    return preference * (overlap + similar);
  }

  private toGame(game: Games): RecommenderGame {
    return {
      id: game.$id,
      name: game.name,
      slug: game.slug,
      coverUrl: game.coverUrl ?? null,
      releaseYear: game.releaseYear ?? null,
      genres: game.genres ?? [],
      ratingAvg: Number(game.ratingAvg ?? 0),
      ratingCount: Number(game.ratingCount ?? 0),
      hypes: Number(game.hypes ?? 0),
      similarGames: game.similarGames ?? [],
    };
  }
}
