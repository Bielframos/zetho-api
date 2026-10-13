import { resolveStatusChangedAt } from '../../../common/utils/entry-status-date';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import type {
  ZEntries,
  ZEntriesReadOnly,
  ZEntriesStatus,
} from 'src/infra/appwrite/appwrite';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import SCORE_TABLE from 'src/modules/zcoins/score-table';
import { OutboxService } from 'src/infra/events/outbox.service';
import { CommentNotificationService } from './comment-notification.service';
import {
  getStatusAction,
  getStatusRank,
  resolveMaxStatusReached,
  resolveStatusZCoinChanges,
} from './entry-status.policy';

@Injectable()
export class ZethoHandler {
  private readonly logger = new Logger(ZethoHandler.name);
  private static readonly DB_ID = 'app';
  private tablesDB: Appwrite['tablesDB'];

  private statuses: `${ZEntriesStatus}`[] = [
    'completed',
    'backlog',
    'dropped',
    'playing',
    'wishlist',
  ];

  constructor(
    private appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly outbox: OutboxService,
    private readonly commentNotificationService: CommentNotificationService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  /**
   * Processa um registro de `z_entries` enviado pelo webhook.
   *
   * O método valida se a entry já foi processada, aplica regras de hype,
   * calcula o estado anti-spam com base em `z_entries_read`, e atualiza os
   * contadores e saldo dentro de uma transação.
   *
   * @param entry A entrada do usuário a ser sincronizada.
   * @returns Um objeto de sucesso/falha para o processamento do webhook.
   */
  async syncEntry(entry: ZEntries) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: ZethoHandler.name,
        operation: 'webhook.entry-sync',
        metadata: {
          entryId: entry.$id,
          gameId: entry.gameId,
        },
      },
      async () => {
        if (entry.processedAt) {
          throw new ConflictException('Z Entry já processada');
        }

        const currentStatus = entry.status as string | null;
        const currentLiked = entry.liked;
        const currentHyped = entry.hyped ?? false;

        if (currentHyped) {
          try {
            const game = await this.tablesDB.getRow<
              Models.Row & { releaseDate?: string | null }
            >({
              databaseId: ZethoHandler.DB_ID,
              tableId: 'games',
              rowId: entry.gameId,
            });
            if (game.releaseDate) {
              const releaseTime = new Date(game.releaseDate).getTime();
              if (releaseTime <= Date.now()) {
                throw new ConflictException(
                  'Hyped só pode ser registrado para jogos ainda não lançados.',
                );
              }
            }
          } catch (error) {
            if (!(error instanceof ConflictException)) {
              // if the game is missing, allow the hyped entry to proceed without release validation
            }
          }
        }

        const readId = this.createId(entry.ownerFingerprint, entry.gameId);

        const [profiles, existingReadEntry, zStatsRow] = await Promise.all([
          this.tablesDB.listRows<Models.Row & Record<string, unknown>>({
            databaseId: ZethoHandler.DB_ID,
            tableId: 'user_profiles',
            queries: [Query.equal('fingerprint', entry.ownerFingerprint)],
          }),
          this.tablesDB
            .getRow<ZEntriesReadOnly>({
              databaseId: 'app',
              tableId: 'z_entries_read',
              rowId: readId,
            })
            .catch(() => null),
          this.tablesDB
            .getRow<Models.Row & Record<string, unknown>>({
              databaseId: 'app',
              tableId: 'z_entry_count',
              rowId: `zstats_${entry.gameId}`,
            })
            .catch(() => null),
        ]);

        const userProfile = profiles.rows[0];

        if (!userProfile?.userId) {
          throw new InternalServerErrorException(
            'Perfil de usuário não encontrado',
          );
        }

        type LegacyEntrySnapshot = Models.Row & {
          status?: string | null;
          liked?: boolean | null;
          hyped?: boolean | null;
        };

        let fallbackPreviousEntry: LegacyEntrySnapshot | null = null;
        let legacyLikedEver = false;
        let legacyMaxStatusReached: string | null = null;
        const scanLegacyHistory =
          existingReadEntry == null ||
          existingReadEntry.likedEver == null ||
          existingReadEntry.maxStatusReached == null;

        if (scanLegacyHistory) {
          const pageLimit = 100;
          let offset = 0;

          while (true) {
            const legacyPage =
              await this.tablesDB.listRows<LegacyEntrySnapshot>({
                databaseId: ZethoHandler.DB_ID,
                tableId: 'z_entries',
                queries: [
                  Query.equal('ownerFingerprint', entry.ownerFingerprint),
                  Query.notEqual('$id', entry.$id),
                  Query.equal('gameId', entry.gameId),
                  Query.lessThanEqual('$createdAt', entry.$createdAt),
                  Query.orderDesc('$createdAt'),
                  Query.orderDesc('$id'),
                  Query.limit(pageLimit),
                  Query.offset(offset),
                  Query.select(['status', 'liked', 'hyped']),
                ],
              });

            const earlierRows = legacyPage.rows.filter(
              (candidate) =>
                candidate.$createdAt < entry.$createdAt ||
                (candidate.$createdAt === entry.$createdAt &&
                  candidate.$id < entry.$id),
            );
            if (!fallbackPreviousEntry)
              fallbackPreviousEntry = earlierRows[0] ?? null;

            for (const legacyEntry of earlierRows) {
              if (legacyEntry.liked === true) {
                legacyLikedEver = true;
              }

              const legacyStatus = legacyEntry.status ?? null;
              if (
                getStatusRank(legacyStatus) >
                getStatusRank(legacyMaxStatusReached)
              ) {
                legacyMaxStatusReached = legacyStatus;
              }
            }

            const reachedTopRank =
              getStatusRank(legacyMaxStatusReached) >=
              getStatusRank('completed');

            if (
              legacyPage.rows.length === 0 ||
              offset + legacyPage.rows.length >= legacyPage.total ||
              (legacyLikedEver && reachedTopRank)
            ) {
              break;
            }

            offset += legacyPage.rows.length;
          }
        }

        const prevStatus =
          (existingReadEntry?.status as string | null) ??
          fallbackPreviousEntry?.status ??
          null;
        const prevHyped =
          existingReadEntry != null
            ? (existingReadEntry.hyped ?? false)
            : (fallbackPreviousEntry?.hyped ?? false);
        const prevLiked =
          existingReadEntry != null
            ? (existingReadEntry.liked ?? null)
            : (fallbackPreviousEntry?.liked ?? null);
        const likedEver =
          existingReadEntry != null
            ? (existingReadEntry.likedEver ?? existingReadEntry.liked === true)
            : legacyLikedEver || prevLiked === true;
        const maxStatusReached =
          (existingReadEntry?.maxStatusReached as string | null) ??
          (existingReadEntry?.status as string | null) ??
          legacyMaxStatusReached ??
          prevStatus;

        const zcoinChanges = resolveStatusZCoinChanges(
          currentStatus,
          maxStatusReached,
        );

        // -------------------------------------------------
        // Registro da entrada
        // -------------------------------------------------

        const newLikedEver = likedEver || currentLiked === true;
        const newMaxStatusReached = resolveMaxStatusReached(
          maxStatusReached,
          currentStatus,
        );

        /**
         * O payload do read model é montado a partir de uma whitelist e nunca
         * por spread de `entry`: `z_entries` possui colunas que não existem em
         * `z_entries_read` (ex.: `processedAt`, `likeCount`, `commentCount`) e
         * qualquer coluna desconhecida faz o commit da transação falhar com
         * `document_invalid_structure`.
         */
        const readModelData = this.buildReadModelData(entry, {
          statusChangedAt: resolveStatusChangedAt(
            existingReadEntry ? existingReadEntry.status : prevStatus,
            currentStatus,
            existingReadEntry?.statusChangedAt,
            entry.$createdAt,
          ),
          likedEver: newLikedEver,
          maxStatusReached: newMaxStatusReached,
        });

        const eligibleMinutes = (
          status: string | null,
          minutes: number | null | undefined,
        ) =>
          status === 'completed' &&
          Number.isSafeInteger(minutes) &&
          (minutes ?? 0) > 0
            ? minutes!
            : 0;
        const previousMinutes = eligibleMinutes(
          prevStatus,
          existingReadEntry?.playtimeMinutes,
        );
        const nextMinutes = eligibleMinutes(
          currentStatus,
          entry.playtimeMinutes,
        );
        const playtimeDelta = nextMinutes - previousMinutes;
        const playtimeCountDelta =
          Number(nextMinutes > 0) - Number(previousMinutes > 0);
        const playtimeOps = [
          { column: 'completedPlaytimeMinutes', delta: playtimeDelta },
          { column: 'completedPlaytimeCount', delta: playtimeCountDelta },
        ]
          .filter(({ delta }) => delta !== 0)
          .map(({ column, delta }) =>
            this.createCounterOp(
              delta > 0 ? 'increment' : 'decrement',
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              column,
              zStatsRow?.[column],
              Math.abs(delta),
            ),
          );

        const statusOps = this.statuses
          .map((status) => {
            const action = getStatusAction(status, prevStatus, currentStatus);
            if (!action) return null;

            const zstatsCol = `${status}Count`;
            const userCol = `totals${status.charAt(0).toUpperCase() + status.slice(1)}`;

            return [
              this.createCounterOp(
                action,
                'app',
                'z_entry_count',
                `zstats_${entry.gameId}`,
                zstatsCol,
                zStatsRow ? zStatsRow[zstatsCol] : null,
              ),

              this.createCounterOp(
                action,
                'app',
                'user_profiles',
                userProfile.$id,
                userCol,
                userProfile[userCol],
              ),
            ];
          })
          .filter(Boolean)
          .flat();

        let likeOp: Record<string, unknown> | null = null;
        let hypedOps: Array<Record<string, unknown>> = [];
        const zcoinOps: Array<Record<string, unknown>> = zcoinChanges.map(
          (change) =>
            this.createCounterOp(
              change.type === 'input' ? 'increment' : 'decrement',
              'app',
              'user_profiles',
              userProfile.$id,
              'zcoinBalance',
              userProfile.zcoinBalance,
              change.amount,
            ),
        );

        if (prevLiked !== currentLiked) {
          let delta = 0;

          if (prevLiked !== true && currentLiked === true) delta = 1;
          if (prevLiked === true && currentLiked !== true) delta = -1;

          if (delta === 1) {
            likeOp = this.createCounterOp(
              'increment',
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'likes',
              zStatsRow ? zStatsRow.likes : null,
            );
          }

          if (delta === -1) {
            likeOp = this.createCounterOp(
              'decrement',
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'likes',
              zStatsRow ? zStatsRow.likes : null,
            );
          }

          if (currentLiked === true && !likedEver) {
            const engagedValue = SCORE_TABLE.input.engaged;
            const engagedOp = this.createCounterOp(
              'increment',
              'app',
              'user_profiles',
              userProfile.$id,
              'zcoinBalance',
              userProfile.zcoinBalance,
              engagedValue,
            );

            zcoinOps.push(engagedOp);
            zcoinChanges.push({
              type: 'input',
              reason: 'engaged',
              amount: engagedValue,
            });
          }
        }

        if (prevHyped !== currentHyped) {
          const action = currentHyped ? 'increment' : 'decrement';

          hypedOps = [
            this.createCounterOp(
              action,
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'hypedCount',
              zStatsRow ? zStatsRow.hypedCount : null,
            ),
            this.createCounterOp(
              action,
              'app',
              'user_profiles',
              userProfile.$id,
              'totalsHyped',
              userProfile.totalsHyped,
            ),
          ];
        }

        // -------------------------------------------------
        // Transaction
        // -------------------------------------------------
        let tx: Models.Transaction | null = null;

        try {
          tx = await this.tablesDB.createTransaction();
          if (!tx) {
            throw new InternalServerErrorException(
              'Falha ao iniciar transação',
            );
          }
          const transactionId = tx.$id;

          await this.tablesDB.upsertRow({
            transactionId,
            databaseId: 'app',
            tableId: 'z_entries_read',
            rowId: readId,
            data: readModelData,
          });

          const operations = [
            ...statusOps,
            ...playtimeOps,
            likeOp,
            ...hypedOps,
            ...zcoinOps,
          ].filter((operation): operation is Record<string, unknown> =>
            Boolean(operation),
          );

          if (operations.length > 0) {
            await this.tablesDB.createOperations({
              transactionId,
              operations,
            });
          }

          if (zcoinChanges.length > 0) {
            await Promise.all(
              zcoinChanges.map((change) =>
                this.tablesDB.createRow({
                  transactionId,
                  databaseId: 'app',
                  tableId: 'zcoin_transactions',
                  rowId: ID.unique(),
                  data: {
                    userId: userProfile.userId,
                    amount:
                      change.type === 'input' ? change.amount : -change.amount,
                    type: change.type,
                    reason: change.reason,
                  },
                }),
              ),
            );
          }

          /** Marca o registro como processado */
          await this.tablesDB.createOperations({
            transactionId,
            operations: [
              {
                action: 'update',
                databaseId: 'app',
                tableId: 'z_entries',
                rowId: entry.$id,
                data: { processedAt: new Date().toISOString() },
              },
            ],
          });

          if (entry.status === 'completed' && prevStatus !== 'completed') {
            await this.outbox.enqueue(transactionId, {
              type: 'D8_ENTRY_COMPLETED',
              payload: {
                profileId: userProfile.$id,
                gameId: entry.gameId,
                createdAt: entry.$createdAt,
              },
            });
          }

          await this.tablesDB.updateTransaction({
            transactionId,
            commit: true,
          });

          return {
            message: `O registro de id ${entry.$id} foi processado.`,
            success: true,
          };
        } catch (err) {
          if (tx?.$id) {
            await this.tablesDB.updateTransaction({
              transactionId: tx.$id,
              rollback: true,
            });
          }

          throw new InternalServerErrorException(
            `O registro de id ${entry.$id} não foi processado.`,
          );
        }
      },
      {
        skipError: (error) => error instanceof ConflictException,
      },
    );
  }

  /** Métodos auxiliares */

  /**
   * Monta o payload de `z_entries_read` a partir das colunas projetadas do
   * evento, ignorando qualquer coluna exclusiva de `z_entries`.
   *
   * O Appwrite valida a estrutura da linha somente no commit da transação, de
   * modo que uma coluna desconhecida derruba o lote inteiro (read model,
   * contadores, zcoins e a marcação de `processedAt`) sem erro no staging.
   *
   * @param entry Evento recebido pelo webhook.
   * @param derived Campos derivados mantidos apenas no read model.
   */
  private buildReadModelData(
    entry: ZEntries,
    derived: {
      likedEver: boolean;
      maxStatusReached: string | null;
      statusChangedAt: string | null;
    },
  ): Record<string, unknown> {
    return {
      gameId: entry.gameId,
      ownerFingerprint: entry.ownerFingerprint,
      status: entry.status ?? null,
      statusChangedAt: derived.statusChangedAt,
      liked: entry.liked ?? null,
      hyped: entry.hyped ?? false,
      likedEver: derived.likedEver,
      maxStatusReached: derived.maxStatusReached,
      playedPlatform: entry.playedPlatform ?? null,
      ...(entry.playedPlatformId !== undefined
        ? { playedPlatformId: entry.playedPlatformId }
        : {}),
      completionType:
        entry.status === 'completed' ? (entry.completionType ?? null) : null,
      playtimeMinutes: entry.playtimeMinutes ?? null,
    };
  }

  /**
   * Cria um ID determinístico para a linha de leitura de um par
   * `ownerFingerprint` / `gameId`.
   */
  private createId(ownerFingerprint: string, gameId: string) {
    return crypto
      .createHash('sha256')
      .update(`${ownerFingerprint}_${gameId}`)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Constrói uma operação de tabela para incrementar/decrementar um campo.
   * Se o valor atual da coluna for nulo ou indefinido, realiza um 'update' direto
   * definindo o novo valor calculado a partir de 0, garantindo compatibilidade com
   * registros criados antes da implementação atômica.
   *
   * @param action Tipo de alteração ('increment' | 'decrement').
   * @param databaseId ID do banco de dados Appwrite.
   * @param tableId ID da tabela alvo.
   * @param rowId ID da linha a ser atualizada.
   * @param column Coluna que receberá o delta/update.
   * @param currentValue Valor atual conhecido da coluna na linha.
   * @param delta Valor do delta.
   */
  private createCounterOp(
    action: 'increment' | 'decrement',
    databaseId: string,
    tableId: string,
    rowId: string,
    column: string,
    currentValue: unknown,
    delta = 1,
  ) {
    const isNullOrUndefined =
      currentValue === null || currentValue === undefined;

    if (isNullOrUndefined) {
      const initialVal = action === 'increment' ? delta : 0;
      return {
        action: 'update',
        databaseId,
        tableId,
        rowId,
        data: { [column]: initialVal },
      };
    }

    return {
      action,
      databaseId,
      tableId,
      rowId,
      data: { value: delta, column },
    };
  }

  async handleCommentCreate(comment: any) {
    return this.commentNotificationService.handleCommentCreate(comment);
  }
}
