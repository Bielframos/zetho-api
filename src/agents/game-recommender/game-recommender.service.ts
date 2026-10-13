import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Query } from 'node-appwrite';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';
import { GameRecommendationGeneratorService } from './game-recommendation-generator.service';
import {
  CompletedRecommendationReplay,
  GameRecommendationReservationsService,
} from './game-recommendation-reservations.service';
import type {
  GameRecommendationResponse,
  GameRecommendationRow,
  RecommendationCandidate,
  RecommendationScope,
  RecommendationQuota,
  RecommenderGame,
} from './game-recommender.types';

@Injectable()
export class GameRecommenderService {
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'game_recommendations';
  private readonly logger = new Logger(GameRecommenderService.name);

  constructor(
    private readonly generator: GameRecommendationGeneratorService,
    private readonly candidatesService: GameRecommenderCandidatesService,
    private readonly appwrite: Appwrite,
    private readonly reservations: GameRecommendationReservationsService,
  ) {}

  async suggest(
    userId: string,
    scope: RecommendationScope,
    idempotencyKey: string,
  ): Promise<GameRecommendationResponse> {
    if (!process.env.OPENAI_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Game recommendations are unavailable because the OpenAI integration is not configured.',
      );
    }

    const startedAt = Date.now();
    let candidateCount = 0;
    let source: string | null = null;
    let chargeResult: 'not_started' | 'reserved' | 'insufficient' =
      'not_started';
    let refunded = false;
    let result = 'failed';

    try {
      const existing = await this.reservations.findExisting(
        userId,
        idempotencyKey,
      );
      if (existing) {
        result = `idempotent_${existing.state}`;
        return await this.handleExisting(existing);
      }

      try {
        await this.reservations.assertDailyQuota(userId);
      } catch (error) {
        if (
          error instanceof HttpException &&
          error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
        ) {
          result = 'daily_limit';
        }
        throw error;
      }

      const context = await this.candidatesService.build(userId, scope);
      candidateCount = context.candidates.length;

      let reservation: { row: GameRecommendationRow; balance: number };
      try {
        reservation = await this.reservations.reserve(
          context,
          scope,
          idempotencyKey,
          this.generator.model,
        );
        chargeResult = 'reserved';
      } catch (error) {
        if (error instanceof CompletedRecommendationReplay) {
          result = 'idempotent_completed';
          return await this.handleExisting(error.row);
        }
        if (error instanceof BadRequestException) chargeResult = 'insufficient';
        throw error;
      }

      try {
        const choice = await this.generator.generateChoice(context);
        const candidate = context.candidates.find(
          (item) => item.game.id === choice.gameId,
        );
        if (!candidate)
          throw new Error('model selected a game outside the pool');
        source = candidate.source;

        const allowedBaseIds = new Set(
          context.signals.map((signal) => signal.game.id),
        );
        const requestedBaseIds = choice.basedOnGameIds;
        if (requestedBaseIds?.some((id) => !allowedBaseIds.has(id)) === true) {
          throw new Error(
            'model selected a base game outside the provided context',
          );
        }
        const basedOnGameIds = [
          ...new Set(
            requestedBaseIds !== undefined
              ? requestedBaseIds
              : candidate.basedOnGameIds,
          ),
        ].slice(0, 3);
        const generatedAt = new Date().toISOString();

        const completed = await this.reservations.complete(
          reservation.row.$id,
          {
            gameId: candidate.game.id,
            source: candidate.source,
            reason: choice.reason,
            matchSignals: choice.matchSignals,
            basedOnGameIds,
            generatedAt,
            balance: reservation.balance,
          },
        );
        result = 'completed';
        return await this.toResponse(
          completed,
          candidate,
          context.signals.map((signal) => signal.game),
        );
      } catch (error) {
        refunded = await this.reservations.refundPending(
          reservation.row.$id,
          'generation_or_persistence_failed',
        );
        this.logger.error(
          `Falha ao concluir recomendação ${reservation.row.$id}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new BadGatewayException(
          'Não foi possível gerar uma recomendação neste momento.',
        );
      }
    } finally {
      this.logger.log({
        event: 'game_recommendation.finished',
        latencyMs: Date.now() - startedAt,
        source,
        candidateCount,
        model: this.generator.model,
        result,
        chargeResult,
        refunded,
      });
    }
  }

  async history(userId: string, limit = 20, cursor?: string) {
    const queries = [
      Query.equal('userId', userId),
      Query.equal('state', 'completed'),
      Query.orderDesc('$createdAt'),
      Query.limit(limit + 1),
    ];
    if (cursor) {
      const anchor =
        await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
          databaseId: GameRecommenderService.DB_ID,
          tableId: GameRecommenderService.TABLE_ID,
          queries: [
            Query.equal('$id', cursor),
            Query.equal('userId', userId),
            Query.equal('state', 'completed'),
            Query.limit(1),
          ],
        });
      if (!anchor.rows.length)
        throw new BadRequestException('Cursor inválido.');
      queries.push(Query.cursorAfter(cursor));
    }
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
      queries,
    });
    const rows = page.rows.slice(0, limit);
    const games = await this.candidatesService.getGamesByIds(
      rows.flatMap((row) => [row.gameId ?? '', ...(row.basedOnGameIds ?? [])]),
    );
    const gameMap = new Map(games.map((game) => [game.id, game]));
    const quota = await this.quota(userId);
    const items = await Promise.all(
      rows.map(async (row) => {
        const game = gameMap.get(row.gameId ?? '');
        if (!game || !row.source) return null;
        return this.toResponse(
          row,
          { game, source: row.source, score: 0, basedOnGameIds: [] },
          games,
          quota,
        );
      }),
    );
    return {
      items: items.filter(
        (item): item is GameRecommendationResponse => item !== null,
      ),
      nextCursor: page.rows.length > limit ? rows[rows.length - 1].$id : null,
      quota,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileAbandonedReservations(): Promise<number> {
    return this.reservations.reconcileAbandonedReservations();
  }

  async quota(userId: string) {
    return this.reservations.quota(userId);
  }

  private async handleExisting(
    existing: GameRecommendationRow,
  ): Promise<GameRecommendationResponse> {
    if (existing.state === 'pending') {
      throw new ConflictException('Esta solicitação ainda está em andamento.');
    }
    if (existing.state === 'failed') {
      throw new BadGatewayException(
        'A tentativa associada a esta chave falhou anteriormente.',
      );
    }
    return this.toResponse(existing);
  }

  private async toResponse(
    row: GameRecommendationRow,
    selectedCandidate?: RecommendationCandidate,
    knownBaseGames: RecommenderGame[] = [],
    knownQuota?: RecommendationQuota,
  ): Promise<GameRecommendationResponse> {
    if (
      !row.gameId ||
      !row.source ||
      !row.reason ||
      !row.matchSignals ||
      !row.generatedAt ||
      row.balance === null
    ) {
      throw new BadGatewayException('Recomendação persistida está incompleta.');
    }

    const baseIds = row.basedOnGameIds ?? [];
    const [selectedGames, loadedBaseGames] = await Promise.all([
      selectedCandidate
        ? Promise.resolve([selectedCandidate.game])
        : this.candidatesService.getGamesByIds([row.gameId]),
      knownBaseGames.length > 0
        ? Promise.resolve([])
        : this.candidatesService.getGamesByIds(baseIds),
    ]);
    const selected = selectedGames[0];
    if (!selected) {
      throw new BadGatewayException(
        'Jogo recomendado não está mais disponível.',
      );
    }
    const baseMap = new Map(
      [...knownBaseGames, ...loadedBaseGames].map((game) => [game.id, game]),
    );

    return {
      id: row.$id,
      source: row.source,
      game: {
        id: selected.id,
        name: selected.name,
        slug: selected.slug,
        coverUrl: selected.coverUrl,
        releaseYear: selected.releaseYear,
        genres: selected.genres,
        ratingAvg: selected.ratingAvg,
      },
      reason: row.reason,
      matchSignals: row.matchSignals,
      basedOnGames: baseIds.flatMap((id) => {
        const game = baseMap.get(id);
        return game ? [{ id: game.id, name: game.name }] : [];
      }),
      cost: row.cost,
      balance: row.balance,
      generatedAt: row.generatedAt,
      quota:
        knownQuota ??
        (await this.quota(row.userId).catch(() => {
          // A metadata read failure must not turn a completed, paid result into a failure.
          this.logger.warn(
            'Quota temporarily unavailable for completed recommendation',
          );
          return undefined;
        })),
    };
  }
}
