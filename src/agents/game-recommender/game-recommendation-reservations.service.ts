import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Query, type Models } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import type {
  GameRecommendationRow,
  RecommendationContext,
  RecommendationQuota,
  RecommendationScope,
} from './game-recommender.types';

type RecommendationDay = {
  dailyKey: string;
  startAt: string;
  nextAvailableAt: string;
};

export type CompleteRecommendationInput = {
  gameId: string;
  source: NonNullable<GameRecommendationRow['source']>;
  reason: string;
  matchSignals: string[];
  basedOnGameIds: string[];
  generatedAt: string;
  balance: number;
};

export class CompletedRecommendationReplay extends Error {
  constructor(readonly row: GameRecommendationRow) {
    super('recommendation completed concurrently');
  }
}

@Injectable()
export class GameRecommendationReservationsService {
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'game_recommendations';
  static readonly COST = 5;
  static readonly DAILY_LIMIT = 5;
  private static readonly PROMPT_VERSION = 3;
  private static readonly ABANDONED_AFTER_MS = 5 * 60 * 1000;
  private static readonly BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
  private readonly logger = new Logger(
    GameRecommendationReservationsService.name,
  );

  constructor(
    private readonly appwrite: Appwrite,
    private readonly transactionService: TransactionService,
  ) {}

  async complete(
    recommendationId: string,
    input: CompleteRecommendationInput,
  ): Promise<GameRecommendationRow> {
    return this.transactionService.runInTransaction(async ({ txId }) => {
      const active = await this.appwrite.tablesDB.getRow<GameRecommendationRow>(
        {
          databaseId: GameRecommendationReservationsService.DB_ID,
          tableId: GameRecommendationReservationsService.TABLE_ID,
          rowId: recommendationId,
          transactionId: txId,
        },
      );
      if (active.state !== 'pending' || active.refunded) {
        throw new Error('reservation no longer active');
      }
      return this.appwrite.tablesDB.updateRow<GameRecommendationRow>({
        transactionId: txId,
        databaseId: GameRecommendationReservationsService.DB_ID,
        tableId: GameRecommendationReservationsService.TABLE_ID,
        rowId: recommendationId,
        data: {
          ...input,
          state: 'completed',
          failureCode: null,
        },
      });
    });
  }

  async assertDailyQuota(userId: string): Promise<void> {
    const day = this.getRecommendationDay(userId);
    if (
      (await this.recommendationsForDay(userId, day)).length >=
      GameRecommendationReservationsService.DAILY_LIMIT
    ) {
      throw this.dailyLimitExceeded(day);
    }
  }

  private slotKeys(day: RecommendationDay) {
    return Array.from(
      { length: GameRecommendationReservationsService.DAILY_LIMIT },
      (_, slot) =>
        slot === 0
          ? day.dailyKey
          : this.stableId('gday', `${day.dailyKey}:${slot}`),
    );
  }

  async quota(userId: string) {
    const day = this.getRecommendationDay(userId);
    const used = (await this.recommendationsForDay(userId, day)).length;
    return {
      cost: GameRecommendationReservationsService.COST,
      limit: GameRecommendationReservationsService.DAILY_LIMIT,
      remaining: Math.max(
        0,
        GameRecommendationReservationsService.DAILY_LIMIT - used,
      ),
      nextAvailableAt: day.nextAvailableAt,
    };
  }

  async reserve(
    context: RecommendationContext,
    scope: RecommendationScope,
    idempotencyKey: string,
    model: string,
  ): Promise<{ row: GameRecommendationRow; balance: number }> {
    // Five unique keys enforce the cap in the database, across API instances.
    // Slot zero retains the original daily key, counting pre-release records.
    const day = this.getRecommendationDay(context.profile.userId);
    const keys = this.slotKeys(day);
    for (let attempt = 0; attempt < 10; attempt++) {
      const rows = await this.recommendationsForDay(
        context.profile.userId,
        day,
      );
      if (rows.length >= GameRecommendationReservationsService.DAILY_LIMIT)
        throw this.dailyLimitExceeded(day);
      const occupied = new Set(
        rows
          .map((row) => row.dailyKey)
          .filter((key) => keys.includes(key ?? '')),
      );
      // Older completed rows without a key still consume a slot for that day.
      for (const row of rows) {
        if (!row.dailyKey || !keys.includes(row.dailyKey)) {
          const free = keys.find((key) => !occupied.has(key));
          if (free) occupied.add(free);
        }
      }
      const dailyKey = keys.find((key) => !occupied.has(key));
      if (!dailyKey) throw this.dailyLimitExceeded(day);
      try {
        return await this.reserveSlot(
          context,
          scope,
          idempotencyKey,
          {
            ...day,
            dailyKey,
          },
          model,
        );
      } catch (error) {
        if (error instanceof CompletedRecommendationReplay) throw error;
        // Retry only database/slot conflicts; idempotent pending attempts stay pending.
        if ((error as { code?: number }).code !== 409) throw error;
      }
    }
    throw new ConflictException(
      'Muitas solicitações simultâneas. Consulte esta solicitação novamente.',
    );
  }

  private async reserveSlot(
    context: RecommendationContext,
    scope: RecommendationScope,
    idempotencyKey: string,
    recommendationDay: RecommendationDay,
    model: string,
  ): Promise<{ row: GameRecommendationRow; balance: number }> {
    const currentProfile = await this.appwrite.tablesDB.getRow<
      Models.Row & { zcoinBalance?: number }
    >({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: 'user_profiles',
      rowId: context.profile.id,
    });
    const currentBalance = Number(currentProfile.zcoinBalance ?? 0);
    if (currentBalance < GameRecommendationReservationsService.COST) {
      throw new BadRequestException('Saldo insuficiente para essa ação');
    }

    const recommendationId = this.stableId(
      'gr',
      `${context.profile.userId}:${idempotencyKey}`,
    );
    const debitId = this.stableId('gd', recommendationId);

    try {
      await this.transactionService.runInTransaction(async ({ txId }) => {
        await this.appwrite.tablesDB.decrementRowColumn({
          transactionId: txId,
          databaseId: GameRecommendationReservationsService.DB_ID,
          tableId: 'user_profiles',
          rowId: context.profile.id,
          column: 'zcoinBalance',
          value: GameRecommendationReservationsService.COST,
          min: 0,
        });
        await this.appwrite.tablesDB.createRow<GameRecommendationRow>({
          transactionId: txId,
          databaseId: GameRecommendationReservationsService.DB_ID,
          tableId: GameRecommendationReservationsService.TABLE_ID,
          rowId: recommendationId,
          data: {
            userId: context.profile.userId,
            ownerFingerprint: context.profile.fingerprint,
            idempotencyKey,
            dailyKey: recommendationDay.dailyKey,
            gameId: null,
            scope,
            source: null,
            reason: null,
            matchSignals: null,
            basedOnGameIds: null,
            state: 'pending',
            cost: GameRecommendationReservationsService.COST,
            refunded: false,
            model,
            promptVersion: GameRecommendationReservationsService.PROMPT_VERSION,
            generatedAt: null,
            balance: null,
            failureCode: null,
          },
        });
        await this.appwrite.tablesDB.createRow({
          transactionId: txId,
          databaseId: GameRecommendationReservationsService.DB_ID,
          tableId: 'zcoin_transactions',
          rowId: debitId,
          data: {
            userId: context.profile.userId,
            amount: -GameRecommendationReservationsService.COST,
            type: 'output',
            reason: 'game_recommendation',
          },
        });
      });
    } catch (error) {
      const existing = await this.findExisting(
        context.profile.userId,
        idempotencyKey,
      );
      if (existing) return this.resolveReservationCollision(existing);

      if (await this.findByDailyKey(recommendationDay.dailyKey)) {
        throw Object.assign(new Error('daily slot occupied'), { code: 409 });
      }

      const latestProfile = await this.appwrite.tablesDB.getRow<
        Models.Row & { zcoinBalance?: number }
      >({
        databaseId: GameRecommendationReservationsService.DB_ID,
        tableId: 'user_profiles',
        rowId: context.profile.id,
      });
      if (
        Number(latestProfile.zcoinBalance ?? 0) <
        GameRecommendationReservationsService.COST
      ) {
        throw new BadRequestException('Saldo insuficiente para essa ação');
      }
      throw error;
    }

    const [row, updatedProfile] = await Promise.all([
      this.appwrite.tablesDB.getRow<GameRecommendationRow>({
        databaseId: GameRecommendationReservationsService.DB_ID,
        tableId: GameRecommendationReservationsService.TABLE_ID,
        rowId: recommendationId,
      }),
      this.appwrite.tablesDB.getRow<Models.Row & { zcoinBalance?: number }>({
        databaseId: GameRecommendationReservationsService.DB_ID,
        tableId: 'user_profiles',
        rowId: context.profile.id,
      }),
    ]);
    return { row, balance: Number(updatedProfile.zcoinBalance ?? 0) };
  }

  private resolveReservationCollision(existing: GameRecommendationRow): never {
    if (existing.state === 'pending') {
      throw new ConflictException('Esta solicitação ainda está em andamento.');
    }
    if (existing.state === 'completed') {
      throw new CompletedRecommendationReplay(existing);
    }
    throw new BadGatewayException(
      'A tentativa associada a esta chave falhou anteriormente.',
    );
  }

  async refundPending(
    recommendationId: string,
    failureCode: string,
  ): Promise<boolean> {
    const current = await this.appwrite.tablesDB.getRow<GameRecommendationRow>({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: GameRecommendationReservationsService.TABLE_ID,
      rowId: recommendationId,
    });
    if (current.state === 'completed' || current.refunded) return false;

    const profilePage = await this.appwrite.tablesDB.listRows<
      Models.Row & { userId: string }
    >({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', current.userId), Query.limit(1)],
    });
    const profile = profilePage.rows[0];
    if (!profile)
      throw new Error('profile missing during recommendation refund');

    const refundId = this.stableId('gf', recommendationId);
    try {
      return await this.transactionService.runInTransaction(
        async ({ txId }) => {
          const active =
            await this.appwrite.tablesDB.getRow<GameRecommendationRow>({
              databaseId: GameRecommendationReservationsService.DB_ID,
              tableId: GameRecommendationReservationsService.TABLE_ID,
              rowId: recommendationId,
              transactionId: txId,
            });
          if (active.state !== 'pending' || active.refunded) return false;
          await this.appwrite.tablesDB.createOperations({
            transactionId: txId,
            operations: [
              {
                action: 'increment',
                databaseId: GameRecommendationReservationsService.DB_ID,
                tableId: 'user_profiles',
                rowId: profile.$id,
                data: {
                  value: current.cost,
                  column: 'zcoinBalance',
                },
              },
            ],
          });
          await this.appwrite.tablesDB.createRow({
            transactionId: txId,
            databaseId: GameRecommendationReservationsService.DB_ID,
            tableId: 'zcoin_transactions',
            rowId: refundId,
            data: {
              userId: current.userId,
              amount: current.cost,
              type: 'input',
              reason: 'game_recommendation_refund',
            },
          });
          await this.appwrite.tablesDB.updateRow({
            transactionId: txId,
            databaseId: GameRecommendationReservationsService.DB_ID,
            tableId: GameRecommendationReservationsService.TABLE_ID,
            rowId: recommendationId,
            data: {
              state: 'failed',
              refunded: true,
              dailyKey: null,
              failureCode,
            },
          });
          return true;
        },
      );
    } catch (error) {
      const latest = await this.appwrite.tablesDB.getRow<GameRecommendationRow>(
        {
          databaseId: GameRecommendationReservationsService.DB_ID,
          tableId: GameRecommendationReservationsService.TABLE_ID,
          rowId: recommendationId,
        },
      );
      if (latest.refunded || latest.state === 'completed') return false;
      throw error;
    }
  }

  async findExisting(userId: string, idempotencyKey: string) {
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: GameRecommendationReservationsService.TABLE_ID,
      queries: [
        Query.equal('userId', userId),
        Query.equal('idempotencyKey', idempotencyKey),
        Query.limit(1),
      ],
    });
    return page.rows[0] ?? null;
  }

  private async recommendationsForDay(userId: string, day: RecommendationDay) {
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: GameRecommendationReservationsService.TABLE_ID,
      queries: [
        Query.equal('userId', userId),
        Query.equal('state', ['pending', 'completed']),
        Query.or([
          Query.equal('dailyKey', this.slotKeys(day)),
          Query.and([
            Query.isNull('dailyKey'),
            Query.greaterThanEqual('$createdAt', day.startAt),
            Query.lessThan('$createdAt', day.nextAvailableAt),
          ]),
        ]),
        Query.limit(GameRecommendationReservationsService.DAILY_LIMIT),
      ],
    });
    return page.rows;
  }

  private async findByDailyKey(dailyKey: string) {
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: GameRecommendationReservationsService.TABLE_ID,
      queries: [Query.equal('dailyKey', dailyKey), Query.limit(1)],
    });
    return page.rows[0] ?? null;
  }

  private getRecommendationDay(
    userId: string,
    now = new Date(),
  ): RecommendationDay {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: GameRecommendationReservationsService.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    const start = new Date(`${date}T00:00:00-03:00`);
    return {
      dailyKey: this.stableId('gday', `${userId}:${date}`),
      startAt: start.toISOString(),
      nextAvailableAt: new Date(
        start.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  private dailyLimitExceeded(day: RecommendationDay) {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'GAME_RECOMMENDATION_DAILY_LIMIT',
        message: 'Você já usou suas cinco recomendações de hoje.',
        cost: GameRecommendationReservationsService.COST,
        limit: GameRecommendationReservationsService.DAILY_LIMIT,
        remaining: 0,
        nextAvailableAt: day.nextAvailableAt,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async reconcileAbandonedReservations(): Promise<number> {
    const cutoff = new Date(
      Date.now() - GameRecommendationReservationsService.ABANDONED_AFTER_MS,
    ).toISOString();
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommendationReservationsService.DB_ID,
      tableId: GameRecommendationReservationsService.TABLE_ID,
      queries: [
        Query.equal('state', 'pending'),
        Query.lessThan('$createdAt', cutoff),
        Query.orderAsc('$createdAt'),
        Query.limit(100),
      ],
    });

    let refunded = 0;
    for (const row of page.rows) {
      try {
        if (await this.refundPending(row.$id, 'abandoned_reservation')) {
          refunded += 1;
        }
      } catch (error) {
        this.logger.error(
          `Falha ao reconciliar recomendação ${row.$id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (page.rows.length > 0) {
      this.logger.log({
        event: 'game_recommendation.reconciled',
        inspected: page.rows.length,
        refunded,
      });
    }
    return refunded;
  }

  private stableId(prefix: string, value: string) {
    return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 31)}`;
  }
}
