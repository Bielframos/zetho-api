import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from '../../infra/appwrite/appwrite.provider';
import { IGDBService } from './igdb.service';
import { buildSearchDocument } from '../game/game-search.utils';
import {
  buildSearchPatch,
  SEARCH_INDEX_VERSION,
  SearchGameRow,
} from './game-search-enrichment';
import type { IGDBGameWebhook } from './igdb.types';

export const SEARCH_QUEUE_TABLE = 'game_search_jobs';
type RowOperation = {
  action: string;
  databaseId: string;
  tableId: string;
  rowId: string;
  data: Record<string, unknown>;
};

type SearchJob = Models.Row & {
  gameId: string;
  externalReference: number;
  status: string;
  availableAt: string;
  attempts: number;
  leaseToken: string;
  error?: string;
};

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

@Injectable()
export class GameSearchQueueService {
  private readonly logger = new Logger(GameSearchQueueService.name);
  private running = false;
  constructor(
    private readonly appwrite: Appwrite,
    private readonly igdb: IGDBService,
  ) {}
  private get db() {
    return this.appwrite.tablesDB;
  }
  private readonly target = { databaseId: 'app', tableId: SEARCH_QUEUE_TABLE };

  jobData(gameId: string, externalReference: number) {
    return {
      gameId,
      externalReference,
      status: 'pending',
      availableAt: new Date().toISOString(),
      attempts: 0,
      leaseToken: '',
      error: '',
    };
  }

  /** Basic game and durable pending job commit together; retries cannot lose the job. */
  async registerBasic(game: IGDBGameWebhook): Promise<string> {
    if (!Number.isSafeInteger(game.id) || !game.name || !game.slug)
      throw new Error('Invalid IGDB game');
    const existing = await this.db.listRows({
      databaseId: 'app',
      tableId: 'games',
      queries: [
        Query.equal('externalReference', game.id),
        Query.select(['$id']),
        Query.limit(1),
      ],
    });
    const gameId = existing.rows[0]?.$id ?? `igdb_${game.id}`;
    const tx = await this.db.createTransaction();
    try {
      const operations: object[] = [];
      if (!existing.rows.length)
        operations.push({
          action: 'create',
          databaseId: 'app',
          tableId: 'games',
          rowId: gameId,
          data: {
            name: game.name,
            slug: game.slug,
            externalReference: game.id,
            checksum: game.checksum ?? null,
            syncStage: 'basic',
            ...buildSearchDocument(game.name),
          },
        });
      operations.push({
        action: 'upsert',
        ...this.target,
        rowId: gameId,
        data: this.jobData(gameId, game.id),
      });
      await this.db.createOperations({ transactionId: tx.$id, operations });
      await this.db.updateTransaction({ transactionId: tx.$id, commit: true });
      return gameId;
    } catch (error) {
      await this.db
        .updateTransaction({ transactionId: tx.$id, rollback: true })
        .catch(() => undefined);
      throw error;
    }
  }

  async enqueue(games: { $id: string; externalReference: number }[]) {
    if (!games.length) return;
    await this.db.upsertRows({
      ...this.target,
      rows: games.map((game) => ({
        $id: game.$id,
        ...this.jobData(game.$id, game.externalReference),
      })),
    });
  }

  @Interval(5000)
  async tick() {
    if (process.env.GAME_SEARCH_WORKER_DISABLED === 'true' || this.running)
      return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(`Search worker: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async commit(
    operations: RowOperation[],
    validate: () => Promise<boolean>,
  ) {
    const tx = await this.db.createTransaction();
    try {
      // Staging captures row versions. Validate snapshots AFTER staging so changes
      // before staging are detected here, and later changes conflict at commit.
      const jobUpdates = operations.filter(
        (op) => op.tableId === SEARCH_QUEUE_TABLE,
      );
      const compact: object[] = operations.filter(
        (op) => op.tableId !== SEARCH_QUEUE_TABLE,
      );
      if (jobUpdates.length)
        compact.push({
          action: 'bulkUpsert',
          ...this.target,
          data: jobUpdates.map((op) => ({ $id: op.rowId, ...op.data })),
        });
      await this.db.createOperations({
        transactionId: tx.$id,
        operations: compact,
      });
      if (!(await validate())) throw new Error('Snapshot changed');
      await this.db.updateTransaction({ transactionId: tx.$id, commit: true });
    } catch (error) {
      await this.db
        .updateTransaction({ transactionId: tx.$id, rollback: true })
        .catch(() => undefined);
      throw error;
    }
  }

  private async readJobs(ids: string[]) {
    return (
      await this.db.listRows<SearchJob>({
        ...this.target,
        total: false,
        ttl: 0,
        queries: [Query.equal('$id', ids), Query.limit(ids.length)],
      })
    ).rows;
  }

  async processBatch(limit = 50) {
    const page = await this.db.listRows<SearchJob>({
      ...this.target,
      total: false,
      ttl: 0,
      queries: [
        Query.notEqual('status', 'done'),
        Query.lessThanEqual('availableAt', new Date().toISOString()),
        Query.orderAsc('availableAt'),
        Query.orderAsc('$id'),
        Query.limit(limit),
      ],
    });
    if (!page.rows.length) return { processed: 0, failed: 0 };
    const claimed = page.rows.map((job) => ({
      ...job,
      status: 'processing',
      leaseToken: randomUUID(),
      attempts: job.attempts + 1,
      availableAt: new Date(Date.now() + 600_000).toISOString(),
    }));
    try {
      await this.commit(
        claimed.map((job) => ({
          action: 'update',
          ...this.target,
          rowId: job.$id,
          data: {
            status: job.status,
            leaseToken: job.leaseToken,
            attempts: job.attempts,
            availableAt: job.availableAt,
          },
        })),
        async () => {
          const current = new Map(
            (await this.readJobs(claimed.map((job) => job.$id))).map((job) => [
              job.$id,
              job,
            ]),
          );
          return page.rows.every(
            (job) => current.get(job.$id)?.$updatedAt === job.$updatedAt,
          );
        },
      );
    } catch (error) {
      if (
        (error as { code?: number }).code === 409 ||
        String(error).includes('Snapshot changed')
      )
        return { processed: 0, failed: 0 };
      throw error;
    }
    let sources: Map<
      number,
      Awaited<ReturnType<IGDBService['getSearchGamesByIds']>>[number]
    >;
    try {
      sources = new Map(
        (
          await this.igdb.getSearchGamesByIds(
            claimed.map((job) => job.externalReference),
          )
        ).map((game) => [game.id, game]),
      );
    } catch (error) {
      await this.retry(claimed, error);
      return { processed: 0, failed: claimed.length };
    }
    const apply = async (jobs: SearchJob[]) => {
      const games = await this.db.listRows<SearchGameRow>({
        databaseId: 'app',
        tableId: 'games',
        total: false,
        ttl: 0,
        queries: [
          Query.equal(
            '$id',
            jobs.map((job) => job.gameId),
          ),
          Query.limit(jobs.length),
          Query.select([
            '$id',
            '$updatedAt',
            'name',
            'slug',
            'externalReference',
            'syncStage',
            'coverUrl',
            'releaseYear',
            'releaseDate',
            'genres',
            'searchAliases',
            'developerIds',
            'publisherIds',
            'searchIndexVersion',
          ]),
        ],
      });
      const byId = new Map(games.rows.map((game) => [game.$id, game]));
      const operations: RowOperation[] = [];
      for (const job of jobs) {
        const game = byId.get(job.gameId);
        if (!game) throw new Error(`Missing local game ${job.gameId}`);
        const source = sources.get(job.externalReference) ?? {
          id: job.externalReference,
          name: game.name,
        };
        operations.push({
          action: 'update',
          databaseId: 'app',
          tableId: 'games',
          rowId: game.$id,
          data: buildSearchPatch(game, source),
        });
        operations.push({
          action: 'update',
          ...this.target,
          rowId: job.$id,
          data: {
            status: 'done',
            error: sources.has(job.externalReference)
              ? ''
              : 'source_missing: IGDB game unavailable; local metadata preserved',
          },
        });
      }
      await this.commit(operations, async () => {
        const [currentGames, currentJobs] = await Promise.all([
          this.db.listRows({
            databaseId: 'app',
            tableId: 'games',
            total: false,
            ttl: 0,
            queries: [
              Query.equal(
                '$id',
                jobs.map((job) => job.gameId),
              ),
              Query.select(['$id', '$updatedAt']),
              Query.limit(jobs.length),
            ],
          }),
          this.readJobs(jobs.map((job) => job.$id)),
        ]);
        const versions = new Map(
          currentGames.rows.map((game) => [game.$id, game.$updatedAt]),
        );
        const tokens = new Map(
          currentJobs.map((job) => [job.$id, job.leaseToken]),
        );
        return jobs.every(
          (job) =>
            tokens.get(job.$id) === job.leaseToken &&
            versions.get(job.gameId) === byId.get(job.gameId)?.$updatedAt,
        );
      });
    };
    try {
      await apply(claimed);
      return { processed: claimed.length, failed: 0 };
    } catch {
      // A newer generation (or another completed worker) needs no retry. Retrying
      // those rows individually amplifies contention without doing useful work.
      const current = new Map(
        (await this.readJobs(claimed.map((job) => job.$id))).map((job) => [
          job.$id,
          job,
        ]),
      );
      const owned = claimed.filter(
        (job) =>
          current.get(job.$id)?.leaseToken === job.leaseToken &&
          current.get(job.$id)?.status === 'processing',
      );
      if (!owned.length) return { processed: 0, failed: 0 };
      try {
        await apply(owned);
        return { processed: owned.length, failed: 0 };
      } catch {
        /* Isolate invalid rows below. */
      }
      const results = await mapConcurrent(owned, 3, async (job) => {
        try {
          await apply([job]);
          return true;
        } catch (error) {
          await this.retry([job], error);
          return false;
        }
      });
      return {
        processed: results.filter(Boolean).length,
        failed: results.filter((value) => !value).length,
      };
    }
  }

  private async retry(jobs: SearchJob[], error: unknown) {
    try {
      await this.commit(
        jobs.map((job) => ({
          action: 'update',
          ...this.target,
          rowId: job.$id,
          data: {
            status: 'pending',
            error: String(error).slice(0, 1000),
            availableAt: new Date(
              Date.now() +
                Math.min(300_000, 1000 * 2 ** Math.min(job.attempts, 8)),
            ).toISOString(),
          },
        })),
        async () => {
          const tokens = new Map(
            (await this.readJobs(jobs.map((job) => job.$id))).map((job) => [
              job.$id,
              job.leaseToken,
            ]),
          );
          return jobs.every((job) => tokens.get(job.$id) === job.leaseToken);
        },
      );
    } catch (retryError) {
      // Re-enqueued jobs belong to the new generation; other jobs recover by lease expiry.
      this.logger.warn(`Could not release search lease: ${String(retryError)}`);
    }
  }
}
