import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';

// Execute after the optional columns exist and API writes are paused.
// Rebuilds aggregate totals from the current one-row-per-user read model.
async function main() {
  const db = new Appwrite().tablesDB;
  const totals = new Map<string, { minutes: number; count: number }>();
  let offset = 0;
  while (true) {
    const page = await db.listRows<any>({
      databaseId: 'app',
      tableId: 'z_entries_read',
      queries: [
        Query.select(['gameId', 'status', 'playtimeMinutes']),
        Query.limit(100),
        Query.offset(offset),
      ],
    });
    for (const row of page.rows) {
      if (
        row.status !== 'completed' ||
        !Number.isSafeInteger(row.playtimeMinutes) ||
        row.playtimeMinutes <= 0
      )
        continue;
      const total = totals.get(row.gameId) ?? { minutes: 0, count: 0 };
      total.minutes += row.playtimeMinutes;
      total.count += 1;
      totals.set(row.gameId, total);
    }
    offset += page.rows.length;
    if (offset >= page.total || page.rows.length === 0) break;
  }
  const updatedGames = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await db.listRows<any>({
      databaseId: 'app',
      tableId: 'z_entry_count',
      queries: [
        Query.select(['$id', 'game']),
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const row of page.rows) {
      const gameId = typeof row.game === 'string' ? row.game : row.game?.$id;
      if (gameId) updatedGames.add(gameId);
      const total = totals.get(gameId) ?? { minutes: 0, count: 0 };
      await db.updateRow({
        databaseId: 'app',
        tableId: 'z_entry_count',
        rowId: row.$id,
        data: {
          completedPlaytimeMinutes: total.minutes,
          completedPlaytimeCount: total.count,
        },
      });
    }
    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }
  for (const [gameId, total] of totals) {
    if (updatedGames.has(gameId)) continue;
    await db.upsertRow({
      databaseId: 'app',
      tableId: 'z_entry_count',
      rowId: `zstats_${gameId}`,
      data: {
        game: gameId,
        completedPlaytimeMinutes: total.minutes,
        completedPlaytimeCount: total.count,
      },
    });
  }
  console.log(`Rebuilt playtime totals for ${totals.size} games`);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
