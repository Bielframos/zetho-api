import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import { ZEntries, ZEntriesStatus } from 'infra/appwrite';
import { ID, Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import SCORE_TABLE from 'src/modules/zcoins/score-table';

@Injectable()
export class ZethoHandler {
  private readonly logger = new Logger(ZethoHandler.name);

  private tablesDB: Appwrite['databases']['api'];
  private zEntries: Appwrite['databases']['zEntries'];
  private userProfiles: Appwrite['databases']['userProfiles'];
  private zStats: Appwrite['databases']['zStats'];
  private games: Appwrite['databases']['games'];

  private statuses: `${ZEntriesStatus}`[] = [
    'completed',
    'backlog',
    'dropped',
    'playing',
    'wishlist',
  ];

  constructor(private appwrite: Appwrite) {
    this.tablesDB = this.appwrite.databases.api;
    this.zEntries = this.appwrite.databases.zEntries;
    this.userProfiles = this.appwrite.databases.userProfiles;
    this.zStats = this.appwrite.databases.zStats;
    this.games = this.appwrite.databases.games;
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
        const game = await this.games.get(entry.gameId);
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
      this.zEntries.list({
        queries: (q) => [
          q.equal('ownerFingerprint', entry.ownerFingerprint),
          q.notEqual('$id', entry.$id),
          q.equal('gameId', entry.gameId),
          q.orderDesc('$createdAt'),
          q.limit(1),
        ],
      }),
      this.userProfiles.list({
        queries: (q) => [
          q.equal('fingerprint', entry.ownerFingerprint),
          q.select(['$id', 'userId', 'fingerprint']),
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
    const prevLiked = previousEntry?.liked ?? null;
    const prevHyped = previousEntry?.hyped ?? false;
    let zcoinChanges = this.resolveStatusZCoinChanges(
      prevStatus,
      currentStatus,
    );

    const readId = this.createId(entry.ownerFingerprint, entry.gameId);

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

    try {
      await this.tablesDB.upsertRow({
        databaseId: 'app',
        tableId: 'z_entries_read',
        rowId: readId,
        data: {
          ...cleanEntry,
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
      const zStats = await this.zStats.get(`zstats_${entry.gameId}`);
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

      if (prevLiked !== true && currentLiked === true) {
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

  private resolveStatusZCoinChanges(
    prev: string | null,
    current: string | null,
  ) {
    const reasonByStatus: Partial<
      Record<string, keyof typeof SCORE_TABLE.input>
    > = {
      completed: 'finished_game',
      backlog: 'add_game_to_library',
      playing: 'playing_game',
    };

    const changes: Array<{
      type: 'input' | 'output';
      reason: keyof typeof SCORE_TABLE.input;
      amount: number;
    }> = [];

    const previousReason = prev ? reasonByStatus[prev] : undefined;
    if (previousReason && prev !== current) {
      changes.push({
        type: 'output',
        reason: previousReason,
        amount: SCORE_TABLE.input[previousReason],
      });
    }

    const currentReason = current ? reasonByStatus[current] : undefined;
    if (currentReason && prev !== current) {
      changes.push({
        type: 'input',
        reason: currentReason,
        amount: SCORE_TABLE.input[currentReason],
      });
    }

    return changes;
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
