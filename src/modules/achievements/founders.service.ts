import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';

type Allocation = Models.Row & {
  userId: string;
  number: number;
  accountCreatedAt: string;
};
type State = Models.Row & {
  zeroUserId: string;
  nextNumber: number;
  afterCreatedAt?: string;
  afterUserId?: string;
};
const DB = 'app';
export const FOUNDER_LAST_NUMBER = 1000;

export interface PublicFounder {
  gamertag: string;
  number: number;
  profileId: string;
  avatarUrl: string | null;
}

@Injectable()
export class FoundersService {
  private readonly logger = new Logger(FoundersService.name);
  constructor(
    private readonly appwrite: Appwrite,
    private readonly tx: TransactionService,
  ) {}

  async image(): Promise<Buffer> {
    const file = await this.appwrite.storage.getFileView({
      bucketId: 'badges',
      fileId: 'founder-badge',
    });
    return Buffer.from(file);
  }

  async forUser(userId: string): Promise<Allocation | null> {
    try {
      const user = await this.appwrite.users.get({ userId });
      if (!user.emailVerification || !user.status) return null;
      return await this.appwrite.tablesDB.getRow<Allocation>({
        databaseId: DB,
        tableId: 'founder_allocations',
        rowId: userId,
      });
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  async receipt(userId: string) {
    // Read from Users, not the cached JWT guard snapshot: verification may have
    // completed seconds ago in another browser tab or device.
    const user = await this.appwrite.users.get({ userId });
    if (!user.status || !user.emailVerification)
      return { status: 'verification_required' as const };
    await this.sync();
    const allocation = await this.forUser(userId);
    if (allocation)
      return {
        status: 'awarded' as const,
        number: allocation.number,
        code: `#${String(allocation.number).padStart(4, '0')}`,
      };
    const state = await this.state();
    return {
      status:
        state && state.nextNumber <= FOUNDER_LAST_NUMBER
          ? ('pending' as const)
          : ('not_eligible' as const),
    };
  }

  // Runs independently of profile creation: accounts without profiles also reserve a number.
  @Cron('*/1 * * * *')
  async scheduledSync() {
    try {
      await this.sync();
    } catch (error) {
      this.logger.error(
        'Falha ao reservar números dos fundadores',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async state(): Promise<State | null> {
    try {
      return await this.appwrite.tablesDB.getRow<State>({
        databaseId: DB,
        tableId: 'founder_state',
        rowId: 'edition-v1',
      });
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  async publicIdentities(): Promise<PublicFounder[]> {
    const result: PublicFounder[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.appwrite.tablesDB.listRows<Allocation>({
        databaseId: DB,
        tableId: 'founder_allocations',
        queries: [
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      if (!page.rows.length) break;
      const verified = await this.appwrite.users.list({
        queries: [
          Query.equal(
            '$id',
            page.rows.map((row) => row.userId),
          ),
          Query.equal('emailVerification', true),
          Query.equal('status', true),
          Query.limit(100),
        ],
      });
      const eligible = new Set(verified.users.map((user) => user.$id));
      const numbers = new Map(
        page.rows
          .filter((row) => eligible.has(row.userId))
          .map((row) => [row.userId, row.number]),
      );
      if (!numbers.size) {
        if (page.rows.length < 100) break;
        cursor = page.rows.at(-1)!.$id;
        continue;
      }
      // User profiles can outnumber accounts after recovery. Paginate rather than truncate.
      let profileCursor: string | undefined;
      for (;;) {
        const profiles = await this.appwrite.tablesDB.listRows<any>({
          databaseId: DB,
          tableId: 'user_profiles',
          queries: [
            Query.equal('userId', [...numbers.keys()]),
            Query.orderAsc('$id'),
            Query.limit(100),
            Query.select(['$id', 'gamertag', 'avatarUrl', 'userId', 'status']),
            ...(profileCursor ? [Query.cursorAfter(profileCursor)] : []),
          ],
        });
        for (const profile of profiles.rows)
          if (profile.status === 'active')
            result.push({
              gamertag: profile.gamertag,
              number: numbers.get(profile.userId)!,
              profileId: profile.$id,
              avatarUrl: profile.avatarUrl || null,
            });
        if (profiles.rows.length < 100) break;
        profileCursor = profiles.rows.at(-1).$id;
      }
      if (page.rows.length < 100) break;
      cursor = page.rows.at(-1)!.$id;
    }
    return result.sort(
      (a, b) => a.number - b.number || a.profileId.localeCompare(b.profileId),
    );
  }

  async initialize(zeroUserId: string) {
    const existing = await this.state();
    if (existing) {
      if (existing.zeroUserId !== zeroUserId)
        throw new Error('A edição já pertence a outro usuário #0000');
      return;
    }
    const zero = await this.appwrite.users.get({ userId: zeroUserId });
    await this.tx.runInTransaction(async ({ txId }) => {
      await this.appwrite.tablesDB.createRow({
        databaseId: DB,
        tableId: 'founder_state',
        rowId: 'edition-v1',
        data: { zeroUserId, nextNumber: 1 },
        transactionId: txId,
      });
      await this.appwrite.tablesDB.createRow({
        databaseId: DB,
        tableId: 'founder_allocations',
        rowId: zeroUserId,
        data: {
          userId: zeroUserId,
          number: 0,
          accountCreatedAt: zero.$createdAt,
        },
        transactionId: txId,
      });
    });
  }

  // Exposed for the dry-run backfill. No email or other private account data is returned.
  async candidates(
    after?: State,
  ): Promise<{ users: Models.User<Models.Preferences>[] }> {
    return this.appwrite.users.list({
      queries: [
        Query.orderAsc('$createdAt'),
        Query.orderAsc('$id'),
        Query.limit(50),
        Query.lessThan('$createdAt', new Date(Date.now() - 2000).toISOString()),
        ...(after?.afterCreatedAt
          ? [
              Query.or([
                Query.greaterThan('$createdAt', after.afterCreatedAt),
                Query.and([
                  Query.equal('$createdAt', after.afterCreatedAt),
                  Query.greaterThan('$id', after.afterUserId!),
                ]),
              ]),
            ]
          : []),
      ],
    });
  }

  async sync() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await this.state();
      // Explicit bootstrap prevents a mutable nickname from claiming #0000.
      if (!state || state.nextNumber > FOUNDER_LAST_NUMBER) return;
      const batch = await this.candidates(state);
      if (!batch.users.length) return;
      const available = FOUNDER_LAST_NUMBER - state.nextNumber + 1;
      const accounts = batch.users
        .filter((user) => user.$id !== state.zeroUserId)
        .slice(0, available);
      const last =
        accounts.length < available ? batch.users.at(-1)! : accounts.at(-1)!;
      try {
        await this.tx.runInTransaction(async ({ txId }) => {
          const current = await this.appwrite.tablesDB.getRow<State>({
            databaseId: DB,
            tableId: 'founder_state',
            rowId: state.$id,
            transactionId: txId,
          });
          if (
            current.nextNumber !== state.nextNumber ||
            current.afterUserId !== state.afterUserId ||
            current.afterCreatedAt !== state.afterCreatedAt
          ) {
            throw { code: 409, message: 'Founder checkpoint changed; retry' };
          }
          // Every worker writes this same checkpoint. Concurrent commits conflict and retry;
          // allocation rows and checkpoint either all commit or all roll back.
          await this.appwrite.tablesDB.updateRow({
            databaseId: DB,
            tableId: 'founder_state',
            rowId: state.$id,
            data: {
              nextNumber: state.nextNumber + accounts.length,
              afterCreatedAt: last.$createdAt,
              afterUserId: last.$id,
            },
            transactionId: txId,
          });
          for (const [index, user] of accounts.entries()) {
            await this.appwrite.tablesDB.createRow({
              databaseId: DB,
              tableId: 'founder_allocations',
              rowId: user.$id,
              data: {
                userId: user.$id,
                number: state.nextNumber + index,
                accountCreatedAt: user.$createdAt,
              },
              transactionId: txId,
            });
          }
        });
      } catch (error) {
        if (error.code !== 409) throw error;
      }
    }
    throw new Error(
      'Sincronização de fundadores interrompida por disputa; será retomada no próximo ciclo',
    );
  }
}
