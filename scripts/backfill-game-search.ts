import 'dotenv/config';
import { appendFileSync, mkdirSync } from 'node:fs';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { CorrelationContextService } from '../src/common/observability/correlation-context.service';
import { LoggerContextService } from '../src/common/observability/logger-context.service';
import { IGDBCoordinationService } from '../src/modules/igdb/igdb-coordination.service';
import { IGDBService } from '../src/modules/igdb/igdb.service';
import { IGDBUpsertService } from '../src/modules/igdb/igdb-upsert.service';
import { TransactionService } from '../src/infra/appwrite/transaction.service';
import { GameSearchQueueService } from '../src/modules/igdb/game-search-queue.service';
import {
  SEARCH_INDEX_VERSION,
  SearchGameRow,
} from '../src/modules/igdb/game-search-enrichment';
import { ensureGameSearchSchema } from './game-search-schema';
import { buildSearchDocument } from '../src/modules/game/game-search.utils';

const apply = process.argv.includes('--apply');
let stopping = false;
process.once('SIGTERM', () => {
  stopping = true;
});
process.once('SIGINT', () => {
  stopping = true;
});
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const appwrite = new Appwrite();
  const db = appwrite.tablesDB;
  if (process.argv.includes('--schema')) {
    if (!apply) {
      console.log(
        'Schema dry run: pass --apply to create additive search schema.',
      );
      return;
    }
    await ensureGameSearchSchema(db);
    return;
  }
  const correlation = new CorrelationContextService();
  const coordination = new IGDBCoordinationService();
  const igdb = new IGDBService(
    appwrite,
    correlation,
    new LoggerContextService(correlation),
    coordination,
    new IGDBUpsertService(appwrite, new TransactionService(appwrite)),
  );
  const queue = new GameSearchQueueService(appwrite, igdb);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `var/backfill-game-search/${runId}.ndjson`;
  if (apply) mkdirSync('var/backfill-game-search', { recursive: true });
  let scanned = 0,
    enqueued = 0,
    processed = 0;
  let cursor = process.env.SEARCH_BACKFILL_AFTER;
  try {
    if (process.argv.includes('--worker')) {
      if (!apply) throw new Error('--worker requires --apply');
      const concurrency = Number(process.env.SEARCH_BACKFILL_WORKERS ?? 4);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
        throw new Error('Worker concurrency must be 1..8');
      await Promise.all(
        Array.from({ length: concurrency }, async (_, worker) => {
          await delay(worker * 300);
          while (!stopping) {
            try {
              const result = await queue.processBatch();
              if (result.processed || result.failed)
                console.log(
                  JSON.stringify({ phase: 'worker', worker, ...result }),
                );
              if (!result.processed) await delay(1500);
            } catch (error) {
              console.error(`Worker ${worker}: ${String(error)}`);
              await delay(3000);
            }
          }
        }),
      );
      return;
    }
    for (;;) {
      // Cursor traversal is required: this server caps listRows.total at 5000.
      const page = await db.listRows<SearchGameRow>({
        databaseId: 'app',
        tableId: 'games',
        total: false,
        queries: [
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      if (!page.rows.length) break;
      const pending = page.rows.filter(
        (game) => (game.searchIndexVersion ?? 0) < SEARCH_INDEX_VERSION,
      );
      if (pending.some((game) => !Number.isSafeInteger(game.externalReference)))
        throw new Error('Invalid externalReference');
      if (apply && pending.length) {
        // Save the original rows before queueing any writes; no descriptions or user data are removed.
        appendFileSync(
          backup,
          pending.map((game) => JSON.stringify(game)).join('\n') + '\n',
          { mode: 0o600 },
        );
        await queue.enqueue(pending);
        enqueued += pending.length;
        for (
          let i = 0;
          process.env.SEARCH_BACKFILL_EXTERNAL_WORKERS !== 'true' &&
          i < Math.ceil(pending.length / 50);
          i++
        ) {
          const result = await queue.processBatch();
          processed += result.processed;
          console.log(
            JSON.stringify({ phase: 'process', ...result, processed }),
          );
        }
      }
      scanned += page.rows.length;
      cursor = page.rows[page.rows.length - 1].$id;
      console.log(
        JSON.stringify({
          phase: 'scan',
          apply,
          scanned,
          enqueued,
          processed,
          cursor,
          backup: apply ? backup : undefined,
        }),
      );
      if (stopping || process.argv.includes('--canary')) {
        console.log(
          JSON.stringify({
            phase: stopping ? 'interrupted' : 'canary',
            scanned,
            processed,
            enqueued,
            backup,
          }),
        );
        return;
      }
    }
    if (!apply) return;
    for (;;) {
      const outstanding = await db.listRows({
        databaseId: 'app',
        tableId: 'game_search_jobs',
        queries: [Query.notEqual('status', 'done'), Query.limit(1)],
      });
      if (!outstanding.rows.length) break;
      const result =
        process.env.SEARCH_BACKFILL_EXTERNAL_WORKERS === 'true'
          ? { processed: 0, failed: 0 }
          : await queue.processBatch();
      processed += result.processed;
      console.log(
        JSON.stringify({
          phase: 'drain',
          outstanding: outstanding.total,
          ...result,
          processed,
        }),
      );
      if (!result.processed) await delay(5000);
    }
    // Verify the entire catalog, not the capped total or only the jobs queued in this process.
    let verified = 0;
    const withoutSearchableMetadata: string[] = [];
    cursor = undefined;
    for (;;) {
      const page = await db.listRows<
        SearchGameRow & { searchText?: string; searchName?: string }
      >({
        databaseId: 'app',
        tableId: 'games',
        total: false,
        ttl: 0,
        queries: [
          Query.select([
            '$id',
            'name',
            'searchAliases',
            'developerIds',
            'publisherIds',
            'searchIndexVersion',
            'searchName',
            'searchText',
          ]),
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      if (!page.rows.length) break;
      const missing = page.rows.filter((game) => {
        const expected = buildSearchDocument(
          game.name,
          game.searchAliases ?? [],
          game.developerIds ?? [],
          game.publisherIds ?? [],
        );
        // Legacy rows without a title/source are preserved, not given invented names.
        if (!expected.searchText) withoutSearchableMetadata.push(game.$id);
        return (
          game.searchIndexVersion !== SEARCH_INDEX_VERSION ||
          game.searchName !== expected.searchName ||
          game.searchText !== expected.searchText
        );
      });
      if (missing.length)
        throw new Error(
          `Verification failed: ${missing.map((game) => game.$id).join(',')}`,
        );
      verified += page.rows.length;
      cursor = page.rows[page.rows.length - 1].$id;
    }
    console.log(
      JSON.stringify({
        phase: 'complete',
        scanned,
        enqueued,
        processed,
        verified,
        withoutSearchableMetadata,
        backup,
      }),
    );
  } finally {
    await coordination.onModuleDestroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
