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
} from 'src/common/appwrite/appwrite';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import SCORE_TABLE from 'src/modules/zcoins/score-table';

@Injectable()
export class ZethoHandler {
  private readonly logger = new Logger(ZethoHandler.name);
  private static readonly DB_ID = 'app';
  private static readonly STATUS_RANK: Record<string, number> = {
    backlog: 1,
    playing: 2,
    completed: 3,
  };

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

        const [profiles, existingReadEntry] = await Promise.all([
          this.tablesDB.listRows<
            Models.Row & { userId?: string; fingerprint?: string }
          >({
            databaseId: ZethoHandler.DB_ID,
            tableId: 'user_profiles',
            queries: [
              Query.equal('fingerprint', entry.ownerFingerprint),
              Query.select(['$id', 'userId', 'fingerprint']),
            ],
          }),
          this.tablesDB
            .getRow<ZEntriesReadOnly>({
              databaseId: 'app',
              tableId: 'z_entries_read',
              rowId: readId,
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
                  Query.orderDesc('$createdAt'),
                  Query.limit(pageLimit),
                  Query.offset(offset),
                  Query.select(['status', 'liked', 'hyped']),
                ],
              });

            if (!fallbackPreviousEntry) {
              fallbackPreviousEntry = legacyPage.rows[0] ?? null;
            }

            for (const legacyEntry of legacyPage.rows) {
              if (legacyEntry.liked === true) {
                legacyLikedEver = true;
              }

              const legacyStatus = legacyEntry.status ?? null;
              if (
                this.getStatusRank(legacyStatus) >
                this.getStatusRank(legacyMaxStatusReached)
              ) {
                legacyMaxStatusReached = legacyStatus;
              }
            }

            const reachedTopRank =
              this.getStatusRank(legacyMaxStatusReached) >=
              this.getStatusRank('completed');

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

        const zcoinChanges = this.resolveStatusZCoinChanges(
          currentStatus,
          maxStatusReached,
        );

        // -------------------------------------------------
        // Registro da entrada
        // -------------------------------------------------

        const {
          $id,
          $sequence,
          $tableId,
          $databaseId,
          $createdAt,
          $updatedAt,
          $permissions,
          processedAt,
          ...cleanEntry
        } = entry;

        const newLikedEver = likedEver || currentLiked === true;
        const newMaxStatusReached = this.resolveMaxStatusReached(
          maxStatusReached,
          currentStatus,
        );

        const statusOps = this.statuses
          .map((status) => {
            const action = this.getStatusAction(
              status,
              prevStatus,
              currentStatus,
            );
            if (!action) return null;

            return [
              this.createIncDecOp(
                action,
                'app',
                'z_entry_count',
                `zstats_${entry.gameId}`,
                `${status}Count`,
              ),

              this.createIncDecOp(
                action,
                'app',
                'user_profiles',
                userProfile.$id,
                `totals${status.charAt(0).toUpperCase() + status.slice(1)}`,
              ),
            ];
          })
          .filter(Boolean)
          .flat();

        let likeOp: Record<string, unknown> | null = null;
        let hypedOps: Array<Record<string, unknown>> = [];
        const zcoinOps: Array<Record<string, unknown>> = zcoinChanges.map(
          (change) =>
            this.createIncDecOp(
              change.type === 'input' ? 'increment' : 'decrement',
              'app',
              'user_profiles',
              userProfile.$id,
              'zcoinBalance',
              change.amount,
            ),
        );

        if (prevLiked !== currentLiked) {
          let delta = 0;

          if (prevLiked !== true && currentLiked === true) delta = 1;
          if (prevLiked === true && currentLiked !== true) delta = -1;

          if (delta === 1) {
            likeOp = this.createIncDecOp(
              'increment',
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'likes',
            );
          }

          if (delta === -1) {
            likeOp = this.createIncDecOp(
              'decrement',
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'likes',
            );
          }

          if (currentLiked === true && !likedEver) {
            const engagedValue = SCORE_TABLE.input.engaged;
            const engagedOp = this.createIncDecOp(
              'increment',
              'app',
              'user_profiles',
              userProfile.$id,
              'zcoinBalance',
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
            this.createIncDecOp(
              action,
              'app',
              'z_entry_count',
              `zstats_${entry.gameId}`,
              'hypedCount',
            ),
            this.createIncDecOp(
              action,
              'app',
              'user_profiles',
              userProfile.$id,
              'totalsHyped',
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
            data: {
              ...cleanEntry,
              likedEver: newLikedEver,
              maxStatusReached: newMaxStatusReached,
            },
          });

          const operations = [
            ...statusOps,
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
   * Constrói uma operação de tabela para incrementar ou decrementar um campo.
   *
   * @param action Tipo de operação em TablesDB.
   * @param databaseId ID do banco de dados Appwrite.
   * @param tableId ID da tabela alvo.
   * @param rowId ID da linha a ser atualizada.
   * @param column Coluna que receberá o delta.
   * @param value Valor do delta.
   */
  private createIncDecOp(
    action: 'increment' | 'decrement',
    databaseId: string,
    tableId: string,
    rowId: string,
    column: string,
    value = 1,
  ) {
    return {
      action,
      databaseId,
      tableId,
      rowId,
      data: { value, column },
    };
  }

  /**
   * Retorna a posição do status no ranking de progressão.
   *
   * @param status Status de biblioteca do usuário.
   */
  private getStatusRank(status: string | null): number {
    return status ? (ZethoHandler.STATUS_RANK[status] ?? 0) : 0;
  }

  /**
   * Resolve as mudanças de zcoins para mudança de status.
   * Anti-spam: só premia na primeira vez que o usuário alcança cada nível de
   * progresso, com base no maxStatusReached persistido em z_entries_read.
   */
  /**
   * Calcula as recompensas de zcoin para transições de status.
   *
   * O backend deve concordar com o cálculo otimista do frontend:
   * premia apenas a primeira vez que o usuário sobe de nível.
   *
   * @param current Status atual do registro.
   * @param maxStatusReached Melhor status já alcançado.
   */
  private resolveStatusZCoinChanges(
    current: string | null,
    maxStatusReached: string | null,
  ) {
    const reasonByStatus: Partial<
      Record<string, keyof typeof SCORE_TABLE.input>
    > = {
      backlog: 'add_game_to_library',
      playing: 'playing_game',
      completed: 'finished_game',
    };

    const changes: Array<{
      type: 'input' | 'output';
      reason: keyof typeof SCORE_TABLE.input;
      amount: number;
    }> = [];

    const currentRank = this.getStatusRank(current);
    const maxRank = this.getStatusRank(maxStatusReached);

    if (currentRank > maxRank) {
      const reason = current ? reasonByStatus[current] : undefined;
      if (reason) {
        changes.push({
          type: 'input',
          reason,
          amount: SCORE_TABLE.input[reason],
        });
      }
    }

    return changes;
  }

  /**
   * Retorna o maior status alcançado entre o atual e o candidato.
   *
   * Usado para manter `maxStatusReached` no read model.
   */
  private resolveMaxStatusReached(
    current: string | null,
    candidate: string | null,
  ): string | null {
    const currentRank = this.getStatusRank(current);
    const candidateRank = this.getStatusRank(candidate);

    return candidateRank > currentRank ? candidate : current;
  }

  /**
   * Determina se a operação de contador deve incrementar ou decrementar um status.
   *
   * @param status Status alvo.
   * @param prev Status anterior.
   * @param current Status atual.
   */
  private getStatusAction(
    status: `${ZEntriesStatus}`,
    prev?: string | null,
    current?: string | null,
  ) {
    if (prev !== status && current === status) return 'increment';
    if (prev === status && current !== status) return 'decrement';
    return null;
  }
}
