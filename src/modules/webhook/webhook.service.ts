import { ConflictException, Injectable } from '@nestjs/common';
import { ZEntries, ZEntriesStatus } from 'infra/appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class WebhookService {
  private zEntries: Appwrite['databases']['zEntries'];
  private userProfiles: Appwrite['databases']['userProfilese'];

  private statuses: `${ZEntriesStatus}`[] = [
    'completed',
    'backlog',
    'dropped',
    'playing',
    'wishlist',
  ];

  constructor(private appwrite: Appwrite) {
    this.zEntries = this.appwrite.databases.zEntries;
    this.userProfiles = this.appwrite.databases.userProfilese;
  }

  /** Método que faz a sincronização de novas entries */
  async syncEntry(entry: ZEntries) {
    if (entry.processedAt) {
      throw new ConflictException('Z Entry já processada');
    }

    const currentStatus = entry.status;
    const currentLiked = entry.liked;

    const previousEntries = await this.zEntries.list({
      queries: (q) => [
        q.equal('ownerFingerprint', entry.ownerFingerprint),
        q.equal('gameId', entry.gameId),
        q.orderDesc('$createdAt'),
        q.limit(2),
      ],
    });

    const previousEntry =
      previousEntries.rows.length > 1 ? previousEntries.rows[1] : null;

    const prevStatus = previousEntry?.status ?? null;
    const prevLiked = previousEntry?.liked ?? null;

    const profiles = await this.userProfiles.list({
      queries: (q) => [
        q.equal('userId', entry.ownerFingerprint),
        q.select(['$id', 'userId', 'fingerprint']),
      ],
    });

    const userProfile = profiles.rows[0];

    const statsOps = this.statuses
      .map((status) => {
        const action = this.getStatusAction(status, prevStatus, currentStatus);
        if (!action) return null;

        return this.createOp(
          action,
          'app',
          'z_entry_count',
          `zstats_${entry.gameId}`,
          `${status}Count`,
        );
      })
      .filter(Boolean);

    const profileOps = this.statuses
      .map((status) => {
        const action = this.getStatusAction(status, prevStatus, currentStatus);
        if (!action) return null;

        const key = `totals${status.charAt(0).toUpperCase() + status.slice(1)}`;

        return this.createOp(
          action,
          'app',
          'user_profiles',
          userProfile.$id,
          key,
        );
      })
      .filter(Boolean);
  }

  /** Métodos auxiliares */
  private createOp(
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
