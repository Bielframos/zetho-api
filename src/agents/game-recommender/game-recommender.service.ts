import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Query, type Models } from 'node-appwrite';
import { z, type Genkit } from 'genkit';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { GameRecommenderCandidatesService } from './game-recommender-candidates.service';
import type {
  GameRecommendationResponse,
  GameRecommendationRow,
  RecommendationCandidate,
  RecommendationContext,
  RecommendationScope,
  RecommendationQuota,
  RecommenderGame,
} from './game-recommender.types';

const recommendationOutputSchema = z.object({
  gameId: z.string().min(1).max(96),
  reason: z.string().trim().min(10).max(300),
  matchSignals: z.array(z.string().trim().min(3).max(140)).min(2).max(4),
  basedOnGameIds: z.array(z.string().min(1).max(96)).max(3).optional(),
});

type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

type RecommendationDay = {
  dailyKey: string;
  startAt: string;
  nextAvailableAt: string;
};

class CompletedRecommendationReplay extends Error {
  constructor(readonly row: GameRecommendationRow) {
    super('recommendation completed concurrently');
  }
}

@Injectable()
export class GameRecommenderService {
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'game_recommendations';
  private static readonly COST = 5;
  private static readonly DAILY_LIMIT = 5;
  private static readonly PROMPT_VERSION = 3;
  private static readonly DEFAULT_MODEL = 'openai/gpt-5.4';
  private static readonly DEFAULT_TIMEOUT_MS = 8_000;
  private static readonly ABANDONED_AFTER_MS = 5 * 60 * 1000;
  private static readonly BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
  private readonly logger = new Logger(GameRecommenderService.name);
  private readonly model =
    process.env.GAME_RECOMMENDER_MODEL ?? GameRecommenderService.DEFAULT_MODEL;
  private readonly timeoutMs = this.parseTimeout(
    process.env.GAME_RECOMMENDER_TIMEOUT_MS,
  );

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly candidatesService: GameRecommenderCandidatesService,
    private readonly appwrite: Appwrite,
    private readonly transactionService: TransactionService,
  ) {}

  async suggest(
    userId: string,
    scope: RecommendationScope,
    idempotencyKey: string,
  ): Promise<GameRecommendationResponse> {
    const startedAt = Date.now();
    let candidateCount = 0;
    let source: string | null = null;
    let chargeResult: 'not_started' | 'reserved' | 'insufficient' =
      'not_started';
    let refunded = false;
    let result = 'failed';

    try {
      const existing = await this.findExisting(userId, idempotencyKey);
      if (existing) {
        result = `idempotent_${existing.state}`;
        return await this.handleExisting(existing);
      }

      const recommendationDay = this.getRecommendationDay(userId);
      if (
        (await this.recommendationsForDay(userId, recommendationDay)).length >=
        GameRecommenderService.DAILY_LIMIT
      ) {
        result = 'daily_limit';
        throw this.dailyLimitExceeded(recommendationDay);
      }

      const context = await this.candidatesService.build(userId, scope);
      candidateCount = context.candidates.length;

      let reservation: { row: GameRecommendationRow; balance: number };
      try {
        reservation = await this.reserve(
          context,
          scope,
          idempotencyKey,
          this.getRecommendationDay(userId),
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
        const choice = await this.generateChoice(context);
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

        const completed = await this.transactionService.runInTransaction(
          async ({ txId }) => {
            const active =
              await this.appwrite.tablesDB.getRow<GameRecommendationRow>({
                databaseId: GameRecommenderService.DB_ID,
                tableId: GameRecommenderService.TABLE_ID,
                rowId: reservation.row.$id,
                transactionId: txId,
              });
            if (active.state !== 'pending' || active.refunded) {
              throw new Error('reservation no longer active');
            }
            return this.appwrite.tablesDB.updateRow<GameRecommendationRow>({
              transactionId: txId,
              databaseId: GameRecommenderService.DB_ID,
              tableId: GameRecommenderService.TABLE_ID,
              rowId: reservation.row.$id,
              data: {
                gameId: candidate.game.id,
                source: candidate.source,
                reason: choice.reason,
                matchSignals: choice.matchSignals,
                basedOnGameIds,
                state: 'completed',
                generatedAt,
                balance: reservation.balance,
                failureCode: null,
              },
            });
          },
        );
        result = 'completed';
        return await this.toResponse(
          completed,
          candidate,
          context.signals.map((signal) => signal.game),
        );
      } catch (error) {
        refunded = await this.refundPending(
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
        model: this.model,
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
    const cutoff = new Date(
      Date.now() - GameRecommenderService.ABANDONED_AFTER_MS,
    ).toISOString();
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
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

  private async generateChoice(
    context: RecommendationContext,
  ): Promise<RecommendationOutput> {
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('game recommender model timeout'));
      }, this.timeoutMs);
      timeout.unref?.();
    });

    try {
      const generation = this.ai.generate({
        model: this.model,
        prompt: this.buildPrompt(context),
        output: { schema: recommendationOutputSchema },
        abortSignal: controller.signal,
      });
      const response = await Promise.race([generation, timeoutPromise]);
      const parsed = recommendationOutputSchema.safeParse(response.output);
      if (!parsed.success) throw new Error('invalid structured model output');

      const candidateIds = new Set(
        context.candidates.map((candidate) => candidate.game.id),
      );
      if (!candidateIds.has(parsed.data.gameId)) {
        throw new Error('model selected a game outside the candidate pool');
      }
      this.validateUserFacingOutput(parsed.data, context);
      return parsed.data;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private buildPrompt(context: RecommendationContext): string {
    const candidates = context.candidates.map((candidate) => ({
      id: candidate.game.id,
      name: candidate.game.name,
      source: candidate.source,
      genres: candidate.game.genres,
      ratingAvg: candidate.game.ratingAvg,
      ratingCount: candidate.game.ratingCount,
      releaseYear: candidate.game.releaseYear,
      preferenceScore: Number(candidate.score.toFixed(3)),
      affinities: candidate.basedOnGameIds.map((signalId) => {
        const signal = context.signals.find(
          (item) => item.game.id === signalId,
        );
        if (!signal) {
          return {
            basedOnGame: { id: signalId, name: null },
            sharedGenreIds: [],
            directlyRelated: false,
          };
        }
        return {
          basedOnGame: { id: signalId, name: signal.game.name },
          sharedGenreIds: candidate.game.genres.filter((genre) =>
            signal.game.genres.includes(genre),
          ),
          directlyRelated:
            signal.game.similarGames.includes(candidate.game.id) ||
            candidate.game.similarGames.includes(signal.game.id),
        };
      }),
    }));
    const recentSignals = context.signals.map((signal) => ({
      id: signal.game.id,
      name: signal.game.name,
      status: signal.status,
      liked: signal.liked,
      likedEver: signal.likedEver,
      genres: signal.game.genres,
      ratingAvg: signal.game.ratingAvg,
    }));

    return [
      '# Papel e personalidade',
      'Você é um amigo que conhece bem videogames e sugere a próxima experiência de forma calorosa, natural e confiante.',
      'Fale diretamente com a pessoa. A resposta deve parecer uma recomendação entre amigos, nunca uma análise do seu próprio processo de decisão.',
      '# Escolha',
      'Escolha exatamente um jogo do array candidates para recomendar.',
      'Use somente IDs presentes nos arrays fornecidos. basedOnGameIds deve conter apenas IDs de recentSignals.',
      'Priorize compatibilidade real de gameplay: loop principal, mecânicas, gênero e ritmo. Use arte, atmosfera, tema ou narrativa apenas como sinais secundários, nunca como a única afinidade.',
      'Não presuma que dois jogos têm gameplay, atmosfera ou estilo de arte semelhantes. Só cite uma afinidade quando ela for sustentada pelos dados fornecidos ou por uma característica amplamente conhecida dos dois jogos.',
      'Se o candidato tiver gameplay muito diferente de um recentSignal, não use esse jogo como base, mesmo que exista afinidade temática ou visual.',
      'Use affinities apenas para escolher e conferir conexões entre os jogos. Um gênero amplo isolado não basta para afirmar gameplay semelhante. Transforme os dados em linguagem natural e nunca copie nomes de campos.',
      'Inclua em basedOnGameIds somente jogos que sustentem diretamente a justificativa. Se não houver uma conexão direta clara, retorne basedOnGameIds vazio e recomende pelo backlog, avaliação ou popularidade sem forçar uma comparação.',
      '# Texto mostrado ao usuário',
      'Escreva reason em português do Brasil em uma ou duas frases curtas, específicas e amigáveis. Apresente o jogo e a conexão com o gosto da pessoa; não explique por que a escolha é tecnicamente válida.',
      'Forneça de 2 a 4 matchSignals curtos, com linguagem de jogador e foco na experiência, como mecânica, ritmo ou gênero. Prefira “Ação run-and-gun” e “Ritmo arcade acelerado” a descrições do processo de seleção.',
      'Nunca exponha IDs, nomes de campos, pontuações internas ou termos do sistema. Não use expressões como “mais defensável”, “evidência”, “similaridade de catálogo”, “affinities”, “preferenceScore”, “directlyRelated” ou “sharedGenreIds”.',
      'Exemplo de tom desejado: reason “Se Metal Slug Advance te divertiu, Blazing Chrome é uma ótima próxima escolha: ele mantém a ação run-and-gun, o ritmo acelerado e a energia arcade.”; matchSignals [“Ação run-and-gun”, “Ritmo arcade acelerado”, “Combate 2D direto”].',
      'Não invente características.',
      JSON.stringify({ candidates, recentSignals }),
    ].join('\n');
  }

  private validateUserFacingOutput(
    choice: RecommendationOutput,
    context: RecommendationContext,
  ) {
    const visibleText = [choice.reason, ...choice.matchSignals].join(' ');
    const internalLanguage =
      /\b(?:mais\s+defens[aá]vel|evid[eê]ncia|affinities|preferenceScore|directlyRelated|sharedGenreIds|pontua(?:ç|c)[aã]o\s+interna)\b|similaridade.{0,30}cat[aá]logo|cat[aá]logo.{0,30}similaridade/iu;
    if (internalLanguage.test(visibleText)) {
      throw new Error('model output exposed internal recommendation language');
    }

    const normalizedText = visibleText.toLocaleLowerCase('pt-BR');
    const exposedId = [...context.candidates, ...context.signals]
      .map((item) => item.game)
      .some((game) => {
        const id = game.id.toLocaleLowerCase('pt-BR');
        const name = game.name.toLocaleLowerCase('pt-BR');
        return id !== name && normalizedText.includes(id);
      });
    if (exposedId) {
      throw new Error('model output exposed a technical game identifier');
    }
  }

  private slotKeys(day: RecommendationDay) {
    return Array.from(
      { length: GameRecommenderService.DAILY_LIMIT },
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
      cost: GameRecommenderService.COST,
      limit: GameRecommenderService.DAILY_LIMIT,
      remaining: Math.max(0, GameRecommenderService.DAILY_LIMIT - used),
      nextAvailableAt: day.nextAvailableAt,
    };
  }

  private async reserve(
    context: RecommendationContext,
    scope: RecommendationScope,
    idempotencyKey: string,
    day: RecommendationDay,
  ): Promise<{ row: GameRecommendationRow; balance: number }> {
    // Five unique keys enforce the cap in the database, across API instances.
    // Slot zero retains the original daily key, counting pre-release records.
    const keys = this.slotKeys(day);
    for (let attempt = 0; attempt < 10; attempt++) {
      const rows = await this.recommendationsForDay(
        context.profile.userId,
        day,
      );
      if (rows.length >= GameRecommenderService.DAILY_LIMIT)
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
        return await this.reserveSlot(context, scope, idempotencyKey, {
          ...day,
          dailyKey,
        });
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
  ): Promise<{ row: GameRecommendationRow; balance: number }> {
    const currentProfile = await this.appwrite.tablesDB.getRow<
      Models.Row & { zcoinBalance?: number }
    >({
      databaseId: GameRecommenderService.DB_ID,
      tableId: 'user_profiles',
      rowId: context.profile.id,
    });
    const currentBalance = Number(currentProfile.zcoinBalance ?? 0);
    if (currentBalance < GameRecommenderService.COST) {
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
          databaseId: GameRecommenderService.DB_ID,
          tableId: 'user_profiles',
          rowId: context.profile.id,
          column: 'zcoinBalance',
          value: GameRecommenderService.COST,
          min: 0,
        });
        await this.appwrite.tablesDB.createRow<GameRecommendationRow>({
          transactionId: txId,
          databaseId: GameRecommenderService.DB_ID,
          tableId: GameRecommenderService.TABLE_ID,
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
            cost: GameRecommenderService.COST,
            refunded: false,
            model: this.model,
            promptVersion: GameRecommenderService.PROMPT_VERSION,
            generatedAt: null,
            balance: null,
            failureCode: null,
          },
        });
        await this.appwrite.tablesDB.createRow({
          transactionId: txId,
          databaseId: GameRecommenderService.DB_ID,
          tableId: 'zcoin_transactions',
          rowId: debitId,
          data: {
            userId: context.profile.userId,
            amount: -GameRecommenderService.COST,
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
        databaseId: GameRecommenderService.DB_ID,
        tableId: 'user_profiles',
        rowId: context.profile.id,
      });
      if (
        Number(latestProfile.zcoinBalance ?? 0) < GameRecommenderService.COST
      ) {
        throw new BadRequestException('Saldo insuficiente para essa ação');
      }
      throw error;
    }

    const [row, updatedProfile] = await Promise.all([
      this.appwrite.tablesDB.getRow<GameRecommendationRow>({
        databaseId: GameRecommenderService.DB_ID,
        tableId: GameRecommenderService.TABLE_ID,
        rowId: recommendationId,
      }),
      this.appwrite.tablesDB.getRow<Models.Row & { zcoinBalance?: number }>({
        databaseId: GameRecommenderService.DB_ID,
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

  private async refundPending(
    recommendationId: string,
    failureCode: string,
  ): Promise<boolean> {
    const current = await this.appwrite.tablesDB.getRow<GameRecommendationRow>({
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
      rowId: recommendationId,
    });
    if (current.state === 'completed' || current.refunded) return false;

    const profilePage = await this.appwrite.tablesDB.listRows<
      Models.Row & { userId: string }
    >({
      databaseId: GameRecommenderService.DB_ID,
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
              databaseId: GameRecommenderService.DB_ID,
              tableId: GameRecommenderService.TABLE_ID,
              rowId: recommendationId,
              transactionId: txId,
            });
          if (active.state !== 'pending' || active.refunded) return false;
          await this.appwrite.tablesDB.createOperations({
            transactionId: txId,
            operations: [
              {
                action: 'increment',
                databaseId: GameRecommenderService.DB_ID,
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
            databaseId: GameRecommenderService.DB_ID,
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
            databaseId: GameRecommenderService.DB_ID,
            tableId: GameRecommenderService.TABLE_ID,
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
          databaseId: GameRecommenderService.DB_ID,
          tableId: GameRecommenderService.TABLE_ID,
          rowId: recommendationId,
        },
      );
      if (latest.refunded || latest.state === 'completed') return false;
      throw error;
    }
  }

  private async findExisting(userId: string, idempotencyKey: string) {
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
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
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
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
        Query.limit(GameRecommenderService.DAILY_LIMIT),
      ],
    });
    return page.rows;
  }

  private async findByDailyKey(dailyKey: string) {
    const page = await this.appwrite.tablesDB.listRows<GameRecommendationRow>({
      databaseId: GameRecommenderService.DB_ID,
      tableId: GameRecommenderService.TABLE_ID,
      queries: [Query.equal('dailyKey', dailyKey), Query.limit(1)],
    });
    return page.rows[0] ?? null;
  }

  private getRecommendationDay(
    userId: string,
    now = new Date(),
  ): RecommendationDay {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: GameRecommenderService.BUSINESS_TIME_ZONE,
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
        cost: GameRecommenderService.COST,
        limit: GameRecommenderService.DAILY_LIMIT,
        remaining: 0,
        nextAvailableAt: day.nextAvailableAt,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
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

  private stableId(prefix: string, value: string) {
    return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 31)}`;
  }

  private parseTimeout(raw: string | undefined) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 100 || parsed > 60_000) {
      return GameRecommenderService.DEFAULT_TIMEOUT_MS;
    }
    return Math.floor(parsed);
  }
}
