import crypto from 'crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ZEntries, ZEntriesStatus } from 'infra/appwrite';
import { Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  private tablesDB: Appwrite['databases']['api'];
  private zEntries: Appwrite['databases']['zEntries'];
  private userProfiles: Appwrite['databases']['userProfiles'];
  private zStats: Appwrite['databases']['zStats'];

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
  }

  /** Método que faz a sincronização de novas entries */
  async syncEntry(entry: ZEntries) {
    if (entry.processedAt) {
      throw new ConflictException('Z Entry já processada');
    }

    const currentStatus = entry.status;
    const currentLiked = entry.liked;

    const [previousEntries, profiles] = await Promise.all([
      this.zEntries.list({
        queries: (q) => [
          q.equal('ownerFingerprint', entry.ownerFingerprint),
          q.equal('gameId', entry.gameId),
          q.orderDesc('$createdAt'),
          q.limit(1),
        ],
      }),
      this.userProfiles.list({
        queries: (q) => [
          q.equal('userId', entry.ownerFingerprint),
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

    const prevStatus = previousEntry?.status ?? null;
    const prevLiked = previousEntry?.liked ?? null;

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
    }

    // -------------------------------------------------
    // Transaction
    // -------------------------------------------------
    let tx: Models.Transaction | null = null;

    try {
      tx = await this.tablesDB.createTransaction();

      const operations = [...statusOps, likeOp].filter(Boolean);

      if (operations.length > 0) {
        await this.tablesDB.createOperations({
          transactionId: tx.$id,
          operations,
        });
      }

      /** Marca o registro como processado */
      await this.tablesDB.createOperations({
        transactionId: tx.$id,
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
        transactionId: tx.$id,
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
  ) {
    return {
      action,
      databaseId,
      tableId,
      rowId,
      data: { value: 1, column },
    };
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
