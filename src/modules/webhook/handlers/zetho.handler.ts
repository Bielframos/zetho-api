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
import { EmailTemplateService } from 'src/modules/notifications/email-template.service';
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
    private readonly emailTemplateService: EmailTemplateService,
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

        const newLikedEver = likedEver || currentLiked === true;
        const newMaxStatusReached = this.resolveMaxStatusReached(
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
          likedEver: newLikedEver,
          maxStatusReached: newMaxStatusReached,
        });

        const statusOps = this.statuses
          .map((status) => {
            const action = this.getStatusAction(
              status,
              prevStatus,
              currentStatus,
            );
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
    derived: { likedEver: boolean; maxStatusReached: string | null },
  ): Record<string, unknown> {
    return {
      gameId: entry.gameId,
      ownerFingerprint: entry.ownerFingerprint,
      status: entry.status ?? null,
      liked: entry.liked ?? null,
      hyped: entry.hyped ?? false,
      likedEver: derived.likedEver,
      maxStatusReached: derived.maxStatusReached,
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

  // Processamento de novos comentários para notificação de resposta
  async handleCommentCreate(comment: any) {
    const parentId = this.extractRelationId(comment.parentId);
    const replyProfileId = this.extractRelationId(comment.userProfile);

    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: ZethoHandler.name,
        operation: 'webhook.comments.on-create',
        metadata: {
          commentId: comment.$id,
          parentId,
          replyProfileId,
        },
      },
      async () => {
        if (!parentId) {
          return {
            success: true,
            message: 'Comentário raiz, sem necessidade de notificação.',
          };
        }

        // 1. Obter comentário pai
        const parentComment = await this.tablesDB.getRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: parentId,
        });

        const parentProfileId = this.extractRelationId(
          parentComment.userProfile,
        );

        if (!parentProfileId) {
          return {
            success: true,
            message: 'Comentário pai sem perfil vinculado.',
          };
        }

        // Ignorar se o usuário estiver respondendo a si mesmo
        if (replyProfileId === parentProfileId) {
          return { success: true, message: 'Auto-resposta ignorada.' };
        }

        // 2. Obter perfis e o jogo do comentário
        const [parentProfile, replyProfile, game] = await Promise.all([
          this.tablesDB.getRow<any>({
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: parentProfileId,
          }),
          replyProfileId
            ? this.tablesDB.getRow<any>({
                databaseId: 'app',
                tableId: 'user_profiles',
                rowId: replyProfileId,
              })
            : Promise.resolve(null),
          comment.gameId
            ? this.tablesDB
                .getRow<any>({
                  databaseId: 'app',
                  tableId: 'games',
                  rowId: comment.gameId,
                })
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        if (!parentProfile.userId) {
          return {
            success: true,
            message: 'Perfil pai não possui userId vinculado.',
          };
        }

        // 3. Enviar e-mail de resposta direto para o autor do comentário pai
        const replyAuthor = replyProfile?.gamertag || 'Alguém';
        const gameName = game?.name || 'um jogo';
        const gameUrl = game?.slug
          ? new URL(`/jogo/${game.slug}`, this.getFrontendAppUrl()).toString()
          : this.getFrontendAppUrl();
        const emailSubject = game?.name
          ? `[Zetho] Nova resposta ao seu comentário em ${game.name}`
          : `[Zetho] Nova resposta ao seu comentário`;
        const emailContent = this.emailTemplateService.renderCommentReplyEmail({
          recipientName: parentProfile.gamertag || 'Gamer',
          replyAuthor,
          commentContent: comment.content,
          gameName,
          gameUrl,
        });

        await this.appwrite.messaging.createEmail(
          ID.unique(),
          emailSubject,
          emailContent,
          [], // topics
          [parentProfile.userId], // users
          [], // targets
          [], // cc
          [], // bcc
          [], // attachments
          false, // draft
          true, // html
        );

        return { success: true, message: 'E-mail de resposta enviado.' };
      },
    );
  }

  /**
   * Normaliza um campo de relacionamento do Appwrite para o seu ID.
   *
   * Relações podem vir como string (ID) ou como o documento aninhado
   * (`{ $id, ... }`) tanto no payload do webhook quanto no retorno de
   * `getRow`. Este helper garante que sempre trabalhamos com o `$id`.
   */
  private extractRelationId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && '$id' in value) {
      const id = (value as { $id?: unknown }).$id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private getFrontendAppUrl() {
    return process.env.FRONTEND_APP_URL || 'https://www.zetho.app/';
  }
}
