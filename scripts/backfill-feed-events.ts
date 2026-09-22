import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { TimelineService } from '../src/system/dashboard/timeline.service';

/** Run after the feed_events table/index and API outbox worker are active. */
async function main() {
  const apply = process.argv.includes('--apply');
  const invalidStatusOnly = process.argv.includes('--invalid-status-only');
  const appwrite = new Appwrite();
  const timeline = new TimelineService(appwrite);
  const tables = invalidStatusOnly
    ? ['z_entries']
    : ['ratings', 'game_comments', 'lists', 'z_entries', 'list_items'];
  const ingestRows = async (table: string, rows: any[]) => {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, rows.length) }, async () => {
        while (next < rows.length) await timeline.ingest(table, rows[next++]);
      }),
    );
  };
  try {
    for (const table of tables) {
      let cursor: string | undefined;
      let count = 0;
      const latestStatus = new Map<string, any>();
      for (;;) {
        const page = await appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: table,
          queries: [
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        });
        if (table === 'z_entries') {
          // A status feed event is keyed by owner/game. Only the newest source
          // row can determine its final value, including removal for wishlist.
          for (const row of page.rows) {
            const key = `${row.ownerFingerprint}\u0000${row.gameId}`;
            const previous = latestStatus.get(key);
            if (
              !previous ||
              previous.$createdAt < row.$createdAt ||
              (previous.$createdAt === row.$createdAt && previous.$id < row.$id)
            )
              latestStatus.set(key, row);
          }
        } else if (apply) {
          await ingestRows(table, page.rows);
        }
        count += page.rows.length;
        if (page.rows.length < 100) break;
        cursor = page.rows.at(-1)?.$id;
      }
      if (table === 'z_entries') {
        const statuses = [...latestStatus.values()].filter(
          (row) =>
            !invalidStatusOnly ||
            !['completed', 'backlog', 'playing', 'dropped'].includes(row.status),
        );
        console.log(`${table}: ${statuses.length} latest owner/game statuses`);
        if (apply) await ingestRows(table, statuses);
      }
      console.log(
        `${table}: ${count} rows ${apply ? 'processed' : 'would be processed'}`,
      );
    }
  } finally {
    await timeline.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
