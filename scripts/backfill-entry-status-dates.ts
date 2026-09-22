import 'dotenv/config';
import { Client, Models, Query, TablesDB } from 'node-appwrite';
import { statusChangedAtFromHistory } from '../src/common/utils/entry-status-date';

const apply = process.argv.includes('--apply');

type Row = Models.Row & Record<string, any>;

async function* pages(db: TablesDB, tableId: string, filters: string[] = []) {
  let cursor: string | undefined;
  do {
    const page = await db.listRows<Row>({
      databaseId: 'app',
      tableId,
      queries: [
        ...filters,
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    yield page.rows;
    cursor = page.rows.length === 100 ? page.rows.at(-1)!.$id : undefined;
  } while (cursor);
}

export async function writeStatusDate(
  db: TablesDB,
  before: Row,
  date: string,
): Promise<boolean> {
  const tx = await db.createTransaction();
  try {
    const current = await db.getRow<Row>({
      databaseId: 'app',
      tableId: 'z_entries_read',
      rowId: before.$id,
      transactionId: tx.$id,
    });
    if (
      current.$updatedAt !== before.$updatedAt ||
      current.status !== before.status ||
      current.statusChangedAt != null
    ) {
      await db.updateTransaction({ transactionId: tx.$id, rollback: true });
      return false;
    }
    await db.updateRow({
      databaseId: 'app',
      tableId: 'z_entries_read',
      rowId: before.$id,
      data: { statusChangedAt: date },
      transactionId: tx.$id,
    });
    await db.updateTransaction({ transactionId: tx.$id, commit: true });
    return true;
  } catch (error) {
    await db
      .updateTransaction({ transactionId: tx.$id, rollback: true })
      .catch(() => undefined);
    throw error;
  }
}

async function main() {
  const db = new TablesDB(
    new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT!)
      .setKey(process.env.APPWRITE_API_KEY!),
  );
  const counts = {
    scanned: 0,
    planned: 0,
    updated: 0,
    unknown: 0,
    pending: 0,
    concurrent: 0,
  };
  for await (const rows of pages(db, 'z_entries_read')) {
    for (const before of rows) {
      counts.scanned++;
      if (before.statusChangedAt != null || !before.status) continue;
      const history: Row[] = [];
      for await (const events of pages(db, 'z_entries', [
        Query.equal('ownerFingerprint', before.ownerFingerprint),
        Query.equal('gameId', before.gameId),
      ]))
        history.push(...events);
      if (history.some((event) => !event.processedAt)) {
        counts.pending++;
        continue;
      }
      history.sort(
        (a, b) =>
          Date.parse(a.$createdAt) - Date.parse(b.$createdAt) ||
          a.$id.localeCompare(b.$id),
      );
      const date = statusChangedAtFromHistory(history);
      if (!date || history.at(-1)?.status !== before.status) {
        counts.unknown++;
        continue;
      }
      counts.planned++;
      if (!apply) continue;
      if (await writeStatusDate(db, before, date)) counts.updated++;
      else counts.concurrent++;
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }));
}
if (require.main === module)
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
