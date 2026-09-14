import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Cache } from 'cache-manager';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { UserProfiles } from 'src/infra/appwrite/appwrite';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import {
  ConnectionCompletedGamesLeaderboardResponse,
  WeeklyZCoinsLeaderboardItem,
  WeeklyZCoinsLeaderboardResponse,
} from './ranking.types';

@Injectable()
export class RankingService {
  private static readonly DB_ID = 'app';
  private static readonly WEEKLY_CACHE_KEY =
    'ranking:leaderboard:weekly:zcoins:top100';
  private static readonly WEEKLY_CACHE_TTL_MS = 15 * 60 * 1000;
  private static readonly CONNECTIONS_CACHE_TTL_MS = 3 * 60 * 1000;

  private readonly logger = new Logger(RankingService.name);
  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  /**
   * Retorna o placar semanal de ganho de Z-Coins, otimizado com cache compartilhado
   * do Top 100 e resolução de perfis em lote (1 batch query).
   */
  async getWeeklyZCoinsLeaderboard(
    limit = 30,
  ): Promise<WeeklyZCoinsLeaderboardResponse> {
    const safeLimit = this.parseLimit(limit, 30);

    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RankingService.name,
        operation: 'ranking.weekly-zcoins',
        metadata: { limit: safeLimit },
      },
      async () => {
        const cached = await this.cache.get<{
          syncedAt: string;
          resetsIn: string;
          since: string;
          leaders: WeeklyZCoinsLeaderboardItem[];
        }>(RankingService.WEEKLY_CACHE_KEY);

        if (cached) {
          const syncedAt = new Date(cached.syncedAt);
          const nextSyncAt = new Date(
            syncedAt.getTime() + RankingService.WEEKLY_CACHE_TTL_MS,
          ).toISOString();

          const leaders = cached.leaders.slice(0, safeLimit);

          return {
            period: 'weekly',
            since: cached.since,
            limit: safeLimit,
            totalPlayers: cached.leaders.length,
            leaders,
            lastSyncAt: cached.syncedAt,
            nextSyncAt,
            resetsIn: cached.resetsIn,
          };
        }

        return this.computeAndCacheWeeklyLeaderboard(safeLimit);
      },
    );
  }

  /**
   * Retorna o ranking de jogos zerados entre as conexões do usuário (seguindo + seguidores + próprio usuário).
   */
  async getConnectionsCompletedGamesLeaderboard(
    userId: string,
    limit = 50,
  ): Promise<ConnectionCompletedGamesLeaderboardResponse> {
    const safeLimit = this.parseLimit(limit, 50);
    const cacheKey = `ranking:connections:completed:${userId}:${safeLimit}`;

    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RankingService.name,
        operation: 'ranking.connections-completed',
        metadata: { userId, limit: safeLimit },
      },
      async () => {
        const cached =
          await this.cache.get<ConnectionCompletedGamesLeaderboardResponse>(
            cacheKey,
          );
        if (cached) {
          return cached;
        }

        // 1. Perfil do próprio usuário
        const myProfile = await this.getProfileByUserId(userId);

        // 2. Buscar conexões onde o usuário é seguidor ou alvo
        const [followingResult, followersResult] = await Promise.all([
          this.tablesDB.listRows<Models.Row & { targetProfileId?: string }>({
            databaseId: RankingService.DB_ID,
            tableId: 'connections',
            queries: [
              Query.equal('requesterProfileId', myProfile.$id),
              Query.limit(100),
            ],
          }),
          this.tablesDB.listRows<Models.Row & { requesterProfileId?: string }>({
            databaseId: RankingService.DB_ID,
            tableId: 'connections',
            queries: [
              Query.equal('targetProfileId', myProfile.$id),
              Query.limit(100),
            ],
          }),
        ]);

        const profileIdsSet = new Set<string>([myProfile.$id]);

        for (const row of followingResult.rows) {
          if (row.targetProfileId) {
            profileIdsSet.add(row.targetProfileId);
          }
        }

        for (const row of followersResult.rows) {
          if (row.requesterProfileId) {
            profileIdsSet.add(row.requesterProfileId);
          }
        }

        const profileIds = Array.from(profileIdsSet);

        // 3. Buscar perfis das conexões em lotes (batch queries)
        const profiles = await this.getProfilesByIds(profileIds);

        // 4. Ordenar perfis por jogos zerados (totalsCompleted) decrescente
        profiles.sort((a, b) => {
          const diff = (b.totalsCompleted ?? 0) - (a.totalsCompleted ?? 0);
          if (diff !== 0) return diff;
          return (a.gamertag ?? '').localeCompare(b.gamertag ?? '', 'pt-BR');
        });

        // 5. Encontrar a posição geral do usuário antes do slice
        const fullIndex = profiles.findIndex((p) => p.userId === userId);
        const currentUserPosition = fullIndex >= 0 ? fullIndex + 1 : null;

        // 6. Formatar líderes com posição
        const leaders = profiles.slice(0, safeLimit).map((p, index) => ({
          position: index + 1,
          userId: p.userId,
          profileId: p.$id,
          gamertag: p.gamertag,
          avatarUrl: p.avatarUrl ?? null,
          completedGames: Number(p.totalsCompleted ?? 0),
          isCurrentUser: p.userId === userId,
        }));

        const response: ConnectionCompletedGamesLeaderboardResponse = {
          category: 'completed_games',
          scope: 'connections',
          totalConnections: Math.max(0, profileIds.length - 1),
          currentUserPosition,
          leaders,
          syncedAt: new Date().toISOString(),
        };

        await this.cache.set(
          cacheKey,
          response,
          RankingService.CONNECTIONS_CACHE_TTL_MS,
        );

        return response;
      },
    );
  }

  /**
   * Cron para aquecimento periódico do cache semanal de Z-Coins a cada 10 minutos.
   */
  @Cron('*/10 * * * *')
  async warmupWeeklyLeaderboardCache() {
    try {
      this.logger.debug('Iniciando aquecimento do cache semanal de Z-Coins...');
      await this.computeAndCacheWeeklyLeaderboard(100);
      this.logger.debug('Aquecimento do cache semanal concluído com sucesso.');
    } catch (error) {
      this.logger.error('Falha ao aquecer o cache semanal de Z-Coins', error);
    }
  }

  private async computeAndCacheWeeklyLeaderboard(
    requestedLimit: number,
  ): Promise<WeeklyZCoinsLeaderboardResponse> {
    const now = new Date();
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - now.getDay());
    lastSunday.setHours(0, 0, 0, 0);
    const since = lastSunday.toISOString();

    const topScores = await this.aggregateTransactionsByUser(100, since);
    const leaders = await this.formatLeaderboard(topScores);

    const syncedAt = new Date().toISOString();
    const resetsIn = new Date(
      lastSunday.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await this.cache.set(
      RankingService.WEEKLY_CACHE_KEY,
      {
        syncedAt,
        resetsIn,
        since,
        leaders,
      },
      RankingService.WEEKLY_CACHE_TTL_MS,
    );

    const nextSyncAt = new Date(
      Date.parse(syncedAt) + RankingService.WEEKLY_CACHE_TTL_MS,
    ).toISOString();

    return {
      period: 'weekly',
      since,
      limit: requestedLimit,
      totalPlayers: leaders.length,
      leaders: leaders.slice(0, requestedLimit),
      lastSyncAt: syncedAt,
      nextSyncAt,
      resetsIn,
    };
  }

  private async aggregateTransactionsByUser(maxLeaders = 100, since: string) {
    const totals = new Map<string, number>();
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const queries = [
        Query.limit(pageSize),
        Query.offset(offset),
        Query.greaterThan('amount', 0),
        Query.greaterThanEqual('$createdAt', since),
        Query.select(['userId', 'amount']),
      ];

      const page = await this.tablesDB.listRows<
        Models.Row & { userId?: string; amount?: number }
      >({
        databaseId: RankingService.DB_ID,
        tableId: 'zcoin_transactions',
        queries,
      });

      for (const row of page.rows) {
        if (!row.userId) {
          continue;
        }

        const amount = Number(row.amount ?? 0);
        totals.set(row.userId, (totals.get(row.userId) ?? 0) + amount);
      }

      offset += page.rows.length;

      if (offset >= page.total || page.rows.length === 0) {
        break;
      }
    }

    return [...totals.entries()]
      .map(([userId, zcoins]) => ({ userId, zcoins }))
      .sort((a, b) => b.zcoins - a.zcoins)
      .slice(0, maxLeaders);
  }

  /**
   * Hidrata os perfis dos líderes em uma única requisição em lote (Batch query).
   */
  private async formatLeaderboard(
    scores: Array<{ userId: string; zcoins: number }>,
  ): Promise<WeeklyZCoinsLeaderboardItem[]> {
    if (scores.length === 0) {
      return [];
    }

    const userIds = scores.map((s) => s.userId);
    const profileMap = new Map<string, UserProfiles>();

    // Chunking em lotes de 100 para respeitar limites do Appwrite
    const chunks = this.chunkArray(userIds, 100);

    for (const chunk of chunks) {
      const profilesResult = await this.tablesDB.listRows<UserProfiles>({
        databaseId: RankingService.DB_ID,
        tableId: 'user_profiles',
        queries: [
          Query.equal('userId', chunk),
          Query.limit(chunk.length),
          Query.select(['userId', 'gamertag', 'avatarUrl']),
        ],
      });

      for (const profile of profilesResult.rows) {
        profileMap.set(profile.userId, profile);
      }
    }

    return scores.map((score, index) => {
      const profile = profileMap.get(score.userId);
      return {
        position: index + 1,
        userId: score.userId,
        gamertag: profile?.gamertag ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        zcoins: score.zcoins,
      };
    });
  }

  private async getProfileByUserId(userId: string): Promise<UserProfiles> {
    const result = await this.tablesDB.listRows<UserProfiles>({
      databaseId: RankingService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });

    const profile = result.rows[0];

    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }

    return profile;
  }

  private async getProfilesByIds(ids: string[]): Promise<UserProfiles[]> {
    if (ids.length === 0) {
      return [];
    }

    const chunks = this.chunkArray(ids, 100);
    const results = await Promise.all(
      chunks.map((chunk) =>
        this.tablesDB.listRows<UserProfiles>({
          databaseId: RankingService.DB_ID,
          tableId: 'user_profiles',
          queries: [
            Query.equal('$id', chunk),
            Query.limit(chunk.length),
            Query.select([
              '$id',
              'userId',
              'gamertag',
              'avatarUrl',
              'totalsCompleted',
            ]),
          ],
        }),
      ),
    );

    return results.flatMap((r) => r.rows);
  }

  private parseLimit(limit: number | undefined, fallback: number) {
    if (limit === undefined || !Number.isFinite(limit)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(limit), 1), 100);
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
