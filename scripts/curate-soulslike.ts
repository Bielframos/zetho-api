import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';

// Input: reviewed JSON array of Appwrite game IDs. Never infer from name or IGDB genre.
async function main() {
  const input = process.argv[2];
  if (!input)
    throw new Error(
      'Usage: ts-node scripts/curate-soulslike.ts reviewed-game-ids.json',
    );
  const ids: unknown = JSON.parse(readFileSync(input, 'utf8'));
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id))
    throw new Error('Expected an array of game IDs');
  const db = new Appwrite().tablesDB;
  for (const id of new Set(ids)) {
    const game = await db.getRow<any>({
      databaseId: 'app',
      tableId: 'games',
      rowId: id,
    });
    await db.updateRow({
      databaseId: 'app',
      tableId: 'games',
      rowId: id,
      data: {
        subgenres: [...new Set([...(game.subgenres ?? []), 'soulslike'])],
      },
    });
    console.log(`curated ${id}`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
