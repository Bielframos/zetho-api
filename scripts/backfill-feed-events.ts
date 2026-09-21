import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { TimelineService } from '../src/system/dashboard/timeline.service';

/** Run after the feed_events table/index and signed timeline webhook are active. */
async function main() {
  const apply = process.argv.includes('--apply');
  const appwrite = new Appwrite();
  const timeline = new TimelineService(appwrite);
  const tables = [
    'ratings',
    'game_comments',
    'lists',
    'z_entries',
    'list_items',
  ];
  try {
    for (const table of tables) {
      let cursor: string | undefined;
      let count = 0;
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
        for (const row of page.rows) {
          if (apply) await timeline.ingest(table, row);
          count++;
        }
        if (page.rows.length < 100) break;
        cursor = page.rows.at(-1)?.$id;
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
