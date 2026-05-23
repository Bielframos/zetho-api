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
import SCORE_TABLE from 'src/modules/zcoins/score-table';

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

  constructor(private appwrite: Appwrite) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  /** Método que faz a sincronização de novas entries */
  async syncEntry(entry: ZEntries) {
    this.logger.debug({ message: 'Iniciando processamento de entrada', entry });

    if (entry.processedAt) {
      throw new ConflictException('Z Entry já processada');
    }

    let currentStatus = entry.status as string | null;
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

    const [previousEntries, profiles] = await Promise.all([
      this.tablesDB.listRows<ZEntries>({
        databaseId: ZethoHandler.DB_ID,
        tableId: 'z_entries',
        queries: [
          Query.equal('ownerFingerprint', entry.ownerFingerprint),
          Query.notEqual('$id', entry.$id),
          Query.equal('gameId', entry.gameId),
          Query.orderDesc('$createdAt'),
          Query.limit(1000),
          Query.select(['status', 'liked', 'hyped']),
        ],
      }),
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
    ]);

    const previousEntry = previousEntries.rows[0] ?? null;
    const userProfile = profiles.rows[0];

    if (!userProfile) {
      throw new InternalServerErrorException(
        'Perfil de usuário não encontrado',
      );
    }

    const prevStatus = (previousEntry?.status as string | null) ?? null;
    const prevHyped = previousEntry?.hyped ?? false;

    const readId = this.createId(entry.ownerFingerprint, entry.gameId);

    // -------------------------------------------------
    // Estado anti-spam: lido do registro persistido em z_entries_read
    // -------------------------------------------------
    const existingReadEntry = await this.tablesDB
      .getRow<ZEntriesReadOnly>({
        databaseId: 'app',
        tableId: 'z_entries_read',
        rowId: readId,
      })
      .catch(() => null);

    const historyLikedEver = previousEntries.rows.some(
      (entry) => entry.liked === true,
    );

    const likedEver =
      (existingReadEntry?.likedEver ?? existingReadEntry?.liked === true) ||
      historyLikedEver;

    const historyMaxStatusReached = this.getHighestStatusReached(
      previousEntries.rows,
    );

    const maxStatusReached =
      existingReadEntry?.maxStatusReached ?? historyMaxStatusReached;

    // Para o delta de likes usamos o estado atual do read model quando houver.
    const prevLiked =
      existingReadEntry != null
        ? (existingReadEntry.liked ?? null)
        : (previousEntry?.liked ?? null);

    let zcoinChanges = this.resolveStatusZCoinChanges(
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

    try {
      await this.tablesDB.upsertRow({
        databaseId: 'app',
        tableId: 'z_entries_read',
        rowId: readId,
        data: {
          ...cleanEntry,
          likedEver: newLikedEver,
          maxStatusReached: newMaxStatusReached,
        },
      });
    } catch (err) {
      throw new InternalServerErrorException('Erro ao salvar o registro');
    }

    // -------------------------------------------------
    // Preparativo da transaction
    // -------------------------------------------------

    const statusOps = this.statuses
      .map((status) => {
        const action = this.getStatusAction(status, prevStatus, currentStatus);
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

    let likeOp: any | null = null;
    let hypedOps: Array<any> = [];
    let zcoinOps = zcoinChanges.map((change) =>
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
      const zStats = await this.tablesDB.getRow<
        Models.Row & { likes?: number }
      >({
        databaseId: ZethoHandler.DB_ID,
        tableId: 'z_entry_count',
        rowId: `zstats_${entry.gameId}`,
      });
      const likesCount = zStats.likes ?? 0;

      let delta = 0;

      if (prevLiked !== true && currentLiked === true) delta = 1;
      if (prevLiked === true && currentLiked !== true) delta = -1;

      if (delta !== 0) {
        likeOp = {
          action: 'update',
          databaseId: 'app',
          tableId: 'z_entry_count',
          rowId: `zstats_${entry.gameId}`,
          data: {
            likes: Math.max(0, likesCount + delta),
          },
        };
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
        throw new InternalServerErrorException('Falha ao iniciar transação');
      }
      const transactionId = tx.$id;

      const operations = [
        ...statusOps,
        likeOp,
        ...hypedOps,
        ...zcoinOps,
      ].filter(Boolean);

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

      this.logger.log(`✓ Webhook: Entrada ${entry.$id} processada com sucesso`);
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

      this.logger.error(
        `✗ Webhook: Falha ao processar entrada ${entry.$id}:`,
        err instanceof Error ? err.message : String(err),
      );
      return {
        message: `O registro de id ${entry.$id} não foi processado.`,
        success: false,
      };
    }
  }

  /** Métodos auxiliares */

  /** Méotodo para criação de um id deterministico */
  private createId(ownerFingerprint: string, gameId: string) {
    return crypto
      .createHash('sha256')
      .update(`${ownerFingerprint}_${gameId}`)
      .digest('hex')
      .substring(0, 32);
  }

  /** Método para criar uma operação de incremento ou decremento */
  private createIncDecOp(
    action: string,
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

  private getStatusRank(status: string | null): number {
    const STATUS_RANK: Record<string, number> = {
      backlog: 1,
      playing: 2,
      completed: 3,
    };

    return status ? (STATUS_RANK[status] ?? 0) : 0;
  }

  private getHighestStatusReached(
    entries: Array<Pick<ZEntries, 'status'> | Pick<ZEntriesReadOnly, 'status'>>,
  ): string | null {
    let highest: string | null = null;

    for (const entry of entries) {
      const status = entry.status as string | null;
      if (this.getStatusRank(status) > this.getStatusRank(highest)) {
        highest = status;
      }
    }

    return highest;
  }

  /**
   * Resolve as mudanças de zcoins para mudança de status.
   * Anti-spam: só premia na primeira vez que o usuário alcança cada nível de
   * progresso, com base no maxStatusReached persistido em z_entries_read.
   */
  private resolveStatusZCoinChanges(
    current: string | null,
    maxStatusReached: string | null,
  ) {
    const STATUS_RANK: Partial<Record<string, number>> = {
      backlog: 1,
      playing: 2,
      completed: 3,
    };

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

    const currentRank = current ? (STATUS_RANK[current] ?? 0) : 0;
    const maxRank = maxStatusReached ? (STATUS_RANK[maxStatusReached] ?? 0) : 0;

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

  /** Retorna o maior status alcançado entre o atual e o candidato */
  private resolveMaxStatusReached(
    current: string | null,
    candidate: string | null,
  ): string | null {
    const STATUS_RANK: Partial<Record<string, number>> = {
      backlog: 1,
      playing: 2,
      completed: 3,
    };

    const currentRank = current ? (STATUS_RANK[current] ?? 0) : 0;
    const candidateRank = candidate ? (STATUS_RANK[candidate] ?? 0) : 0;

    return candidateRank > currentRank ? candidate : current;
  }

  //** Método para obter a ação da operação do status */
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
