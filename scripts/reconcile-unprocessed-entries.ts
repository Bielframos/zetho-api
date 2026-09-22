import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import type { ZEntries } from '../src/infra/appwrite/appwrite';

const entryKey = (entry: ZEntries) =>
  `${entry.ownerFingerprint}\u0000${entry.gameId}`;

const isLater = (left: ZEntries, right: ZEntries) =>
  left.$createdAt > right.$createdAt ||
  (left.$createdAt === right.$createdAt && left.$id > right.$id);

// Historical diagnostics only. Never replay legacy entries through the live handler.
async function main() {
  if (process.argv.slice(2).length) {
    throw new Error(
      'This legacy tool is read-only; --apply has been retired. Use scripts/apply-entry-reconciliation.ts --plan-out <manifest.json>, review the plan, then --apply <manifest.json>.',
    );
  }
  const db = new Appwrite().tablesDB;
  async function* entries() {
    let cursor: string | undefined;
    for (;;) {
      const page = await db.listRows<ZEntries>({
        databaseId: 'app',
        tableId: 'z_entries',
        queries: [
          Query.orderAsc('$createdAt'),
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      for (const entry of page.rows) yield entry;
      if (page.rows.length < 100) break;
      cursor = page.rows.at(-1)?.$id;
    }
  }

  // A late replay of an older entry would regress the current read model.
  const latestProcessed = new Map<string, ZEntries>();
  for await (const entry of entries()) {
    if (!entry.processedAt) continue;
    const key = entryKey(entry);
    const latest = latestProcessed.get(key);
    if (!latest || isLater(entry, latest)) latestProcessed.set(key, entry);
  }

  let pending = 0;
  let unsafe = 0;
  for await (const entry of entries()) {
    if (entry.processedAt) continue;
    pending++;
    const later = latestProcessed.get(entryKey(entry));
    if (later && isLater(later, entry)) {
      unsafe++;
      console.error(
        `unsafe ${entry.$id}: owner/game already has newer processed entry ${later.$id}`,
      );
    }
  }
  console.log(
    `${pending} pending entries; ${unsafe} unsafe chronological replays`,
  );
  if (unsafe) {
    // Fail before changing any row, including safe rows, so repair can be planned.
    process.exitCode = 2;
    return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
