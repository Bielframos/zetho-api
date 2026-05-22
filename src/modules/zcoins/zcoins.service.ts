import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { UserProfiles } from 'infra/appwrite';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import SCORE_TABLE from './score-table';

type ZCoinTransactionType = 'input' | 'output';

@Injectable()
export class ZCoinsService {
  private static readonly WEEKLY_LEADERBOARD_CACHE_TTL_MS = 15 * 60 * 1000;

  private readonly tablesDB: Appwrite['databases']['api'];
  private readonly userProfiles: Appwrite['databases']['userProfiles'];

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly appwrite: Appwrite,
  ) {
    this.tablesDB = this.appwrite.databases.api;
    this.userProfiles = this.appwrite.databases.userProfiles;
  }

  async applyInput(userId: string, reason: string) {
    return this.applyTransaction(userId, 'input', reason);
  }

  async applyOutput(userId: string, reason: string) {
    return this.applyTransaction(userId, 'output', reason);
  }

  async getWeeklyLeaderboard(limit = 20) {
    const safeLimit = this.parseLimit(limit);
    const cacheKey = `zcoins:leaderboard:weekly:${safeLimit}`;
    const cached = await this.cache.get<{
      syncedAt: string;
      payload: {
        period: 'weekly';
        since: string;
        limit: number;
        totalPlayers: number;
        leaders: Array<{
          position: number;
          userId: string;
          gamertag: string | null;
          avatarUrl: string | null;
          zcoins: number;
        }>;
      };
    }>(cacheKey);

    if (cached) {
      const syncedAt = new Date(cached.syncedAt);
      const nextSyncAt = new Date(
        syncedAt.getTime() + ZCoinsService.WEEKLY_LEADERBOARD_CACHE_TTL_MS,
      ).toISOString();

      return {
        ...cached.payload,
        lastSyncAt: cached.syncedAt,
        nextSyncAt,
      };
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sums = await this.aggregateTransactionsByUser(safeLimit, since);
    const payload = await this.formatLeaderboard(
      'weekly',
      safeLimit,
      sums,
      since,
    );
    const syncedAt = new Date().toISOString();

    await this.cache.set(
      cacheKey,
      {
        syncedAt,
        payload,
      },
      ZCoinsService.WEEKLY_LEADERBOARD_CACHE_TTL_MS,
    );

    return {
      ...payload,
      lastSyncAt: syncedAt,
      nextSyncAt: new Date(
        Date.parse(syncedAt) + ZCoinsService.WEEKLY_LEADERBOARD_CACHE_TTL_MS,
      ).toISOString(),
    };
  }

  private async applyTransaction(
    userId: string,
    type: ZCoinTransactionType,
    reason: string,
  ) {
    const safeUserId = userId?.trim();

    if (!safeUserId) {
      throw new BadRequestException('userId é obrigatório');
    }

    if (type === 'input' && reason === 'daily_login') {
      const alreadyReceived =
        await this.hasReceivedDailyLoginBonusToday(safeUserId);

      if (alreadyReceived) {
        throw new ConflictException('Bônus de login diário já concedido hoje');
      }
    }

    const amount = this.resolveAmount(type, reason);
    const profile = await this.getProfileByUserId(safeUserId);

    if (type === 'output') {
      const current = await this.tablesDB.getRow<
        Models.Row & { zcoinBalance?: number }
      >({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: profile.$id,
      });

      const currentBalance = Number(current.zcoinBalance ?? 0);
      if (currentBalance < amount) {
        throw new BadRequestException('Saldo insuficiente para essa ação');
      }
    }

    const tx = await this.tablesDB.createTransaction();
    const transactionId = ID.unique();

    try {
      await this.tablesDB.createOperations({
        transactionId: tx.$id,
        operations: [
          {
            action: type === 'input' ? 'increment' : 'decrement',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: profile.$id,
            data: { value: amount, column: 'zcoinBalance' },
          },
        ],
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId: transactionId,
        data: {
          userId: safeUserId,
          amount: type === 'input' ? amount : -amount,
          type,
          reason,
        },
      });

      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        commit: true,
      });
    } catch (error) {
      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        rollback: true,
      });

      throw error;
    }

    const updated = await this.tablesDB.getRow<
      Models.Row & { zcoinBalance?: number }
    >({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: profile.$id,
    });

    return {
      userId: safeUserId,
      type,
      reason,
      amount: type === 'input' ? amount : -amount,
      balance: Number(updated.zcoinBalance ?? 0),
    };
  }

  private resolveAmount(type: ZCoinTransactionType, reason: string) {
    const safeReason = reason?.trim();

    if (!safeReason) {
      throw new BadRequestException('reason é obrigatório');
    }

    const reasonValues =
      type === 'input'
        ? (SCORE_TABLE.input as Record<string, number>)
        : (SCORE_TABLE.output as Record<string, number>);
    const amount = reasonValues[safeReason];

    if (!amount) {
      throw new BadRequestException('reason inválido para o tipo informado');
    }

    return amount;
  }

  private async getProfileByUserId(userId: string): Promise<UserProfiles> {
    const result = await this.userProfiles.list({
      queries: (q) => [q.equal('userId', userId), q.limit(1)],
    });

    const profile = result.rows[0];

    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }

    return profile;
  }

  private parseLimit(limit: number) {
    if (!Number.isFinite(limit)) {
      return 20;
    }

    return Math.min(Math.max(Math.floor(limit), 1), 100);
  }

  private async aggregateTransactionsByUser(limit: number, since?: string) {
    const totals = new Map<string, number>();
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const queries = [
        Query.limit(pageSize),
        Query.offset(offset),
        Query.select(['userId', 'amount']),
      ];

      if (since) {
        queries.push(Query.greaterThanEqual('$createdAt', since));
      }

      const page = await this.tablesDB.listRows<
        Models.Row & { userId?: string; amount?: number }
      >({
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        queries,
      });

      for (const row of page.rows) {
        if (!row.userId) {
          continue;
        }

        totals.set(
          row.userId,
          (totals.get(row.userId) ?? 0) + Number(row.amount ?? 0),
        );
      }

      offset += page.rows.length;

      if (offset >= page.total || page.rows.length === 0) {
        break;
      }
    }

    return [...totals.entries()]
      .map(([userId, zcoins]) => ({ userId, zcoins }))
      .sort((a, b) => b.zcoins - a.zcoins)
      .slice(0, limit);
  }

  private async formatLeaderboard(
    period: 'weekly',
    limit: number,
    scores: Array<{ userId: string; zcoins: number }>,
    since?: string,
  ) {
    const leaders = await Promise.all(
      scores.map(async (score, index) => {
        const profile = await this.findProfileByUserId(score.userId);

        return {
          position: index + 1,
          userId: score.userId,
          gamertag: profile?.gamertag ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          zcoins: score.zcoins,
        };
      }),
    );

    return {
      period,
      since: since ?? null,
      limit,
      totalPlayers: leaders.length,
      leaders,
    };
  }

  private async findProfileByUserId(userId: string) {
    const result = await this.userProfiles.list({
      queries: (q) => [q.equal('userId', userId), q.limit(1)],
    });

    return result.rows[0] ?? null;
  }

  private async hasReceivedDailyLoginBonusToday(userId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const result = await this.tablesDB.listRows<Models.Row>({
      databaseId: 'app',
      tableId: 'zcoin_transactions',
      queries: [
        Query.equal('userId', userId as any),
        Query.equal('reason', 'daily_login' as any),
        Query.greaterThanEqual('$createdAt', todayStart.toISOString() as any),
        Query.limit(1),
      ],
    });

    return result.total > 0;
  }
}
