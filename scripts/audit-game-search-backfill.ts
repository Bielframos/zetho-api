import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { readSnapshot } from './game-search-snapshot';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';

async function main() {
  const db = new Appwrite().tablesDB;
  const folder = 'var/backfill-game-search';
  const seen = new Set<string>();
  const discovery = new Set([
    '$updatedAt',
    'syncStage',
    'searchName',
    'searchText',
    'searchTerms',
    'searchAliases',
    'searchIndexVersion',
    'developerIds',
    'publisherIds',
    'coverUrl',
    'genres',
    'releaseYear',
    'releaseDate',
  ]);
  const defaultZero = new Set([
    'zethoVersion',
    'ratingAvg',
    'ratingCount',
    'ratingSum',
    'hypes',
  ]);
  const differences: { id: string; field: string }[] = [];
  let verified = 0,
    normalizedDefaults = 0;
  async function audit(original: any[]) {
    const result = await db.listRows({
      databaseId: 'app',
      tableId: 'games',
      total: false,
      queries: [
        Query.equal(
          '$id',
          original.map((row) => row.$id),
        ),
        Query.limit(original.length),
      ],
    });
    const current = new Map(result.rows.map((row) => [row.$id, row]));
    for (const old of original) {
      const now = current.get(old.$id);
      if (!now) {
        differences.push({ id: old.$id, field: 'missing_row' });
        continue;
      }
      for (const field of Object.keys(old)) {
        if (discovery.has(field)) continue;
        if (old[field] === null && now[field] === 0 && defaultZero.has(field)) {
          normalizedDefaults++;
          continue;
        }
        if (JSON.stringify(old[field]) !== JSON.stringify(now[field]))
          differences.push({ id: old.$id, field });
      }
      if (old.syncStage === 'full' && now.syncStage !== 'full')
        differences.push({ id: old.$id, field: 'syncStage' });
      for (const field of [
        'coverUrl',
        'genres',
        'releaseYear',
        'releaseDate',
      ]) {
        if (
          old[field]?.length &&
          JSON.stringify(old[field]) !== JSON.stringify(now[field])
        )
          differences.push({ id: old.$id, field });
      }
      for (const alias of old.searchAliases ?? []) {
        if (!(now.searchAliases ?? []).includes(alias))
          differences.push({ id: old.$id, field: 'searchAliases' });
      }
      verified++;
    }
  }
  let batch: any[] = [];
  for (const file of readdirSync(folder)
    .filter((file) => file.endsWith('.ndjson'))
    .sort()) {
    for await (const row of readSnapshot(`${folder}/${file}`)) {
      if (seen.has(row.$id)) continue;
      seen.add(row.$id);
      batch.push(row);
      if (batch.length === 100) {
        await audit(batch);
        batch = [];
      }
    }
  }
  if (batch.length) await audit(batch);
  console.log(
    JSON.stringify({
      verified,
      normalizedDefaults,
      protectedDifferences: differences,
    }),
  );
  if (differences.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
