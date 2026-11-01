import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';

export const PROFILE_SHARING_VERSION = 'profile-sharing-v1';
@Injectable()
export class ProfileSharingService {
  constructor(
    private readonly appwrite: Appwrite,
    private readonly tx: TransactionService,
  ) {}
  async get(userId: string) {
    try {
      const row = await this.appwrite.tablesDB.getRow({
        databaseId: 'app',
        tableId: 'profile_sharing_consents',
        rowId: userId,
      });
      return {
        allowed: row.allowed === true,
        version: row.version,
        updatedAt: row.recordedAt,
      };
    } catch (error) {
      if (error.code === 404)
        return {
          allowed: false,
          version: PROFILE_SHARING_VERSION,
          updatedAt: null,
        };
      throw error;
    }
  }
  async set(
    userId: string,
    allowed: boolean,
    source: 'registration' | 'settings',
  ) {
    if (typeof allowed !== 'boolean')
      throw new BadRequestException(
        'A autorização deve ser verdadeira ou falsa',
      );
    for (let attempt = 0; attempt < 5; attempt++) {
      const previous = await this.get(userId);
      // Retrying registration must never overwrite a later decision in settings.
      if (source === 'registration' && previous.updatedAt) return previous;
      const data = {
        userId,
        allowed,
        version: PROFILE_SHARING_VERSION,
        recordedAt: new Date().toISOString(),
        source,
      };
      try {
        await this.tx.runInTransaction(async ({ txId }) => {
          const params = {
            databaseId: 'app',
            tableId: 'profile_sharing_consents',
            rowId: userId,
            data,
            transactionId: txId,
          };
          if (previous.updatedAt)
            await this.appwrite.tablesDB.updateRow(params);
          else await this.appwrite.tablesDB.createRow(params);
          await this.appwrite.tablesDB.createRow({
            databaseId: 'app',
            tableId: 'profile_sharing_consent_events',
            rowId: createHash('sha256')
              .update(`${userId}:${data.recordedAt}:${attempt}:${allowed}`)
              .digest('hex')
              .slice(0, 32),
            data,
            transactionId: txId,
          });
        });
        return { allowed, version: data.version, updatedAt: data.recordedAt };
      } catch (error) {
        if (error.code !== 409) throw error;
      }
    }
    throw new Error(
      'Não foi possível registrar a autorização. Tente novamente.',
    );
  }
}
