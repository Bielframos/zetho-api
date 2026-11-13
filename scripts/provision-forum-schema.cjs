/** Additive schema migration for Forum posts on game_comments. Dry-run unless --apply is explicitly supplied. */
require('dotenv/config');
const { Client, TablesDB } = require('node-appwrite');

const db = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_API_KEY),
);

const databaseId = 'app';
const tableId = 'game_comments';

const desiredColumns = [
  { key: 'title', size: 255, required: false },
  { key: 'slug', size: 160, required: false },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const table = await db.getTable({ databaseId, tableId });

  for (const desired of desiredColumns) {
    const existing = table.columns.find((col) => col.key === desired.key);
    if (existing) {
      console.log(`Column ${tableId}.${desired.key} already exists (${existing.status})`);
      continue;
    }
    if (!apply) {
      console.log(`dry-run: create string column ${tableId}.${desired.key} (size ${desired.size})`);
      continue;
    }
    await db.createStringColumn({
      databaseId,
      tableId,
      key: desired.key,
      size: desired.size,
      required: desired.required,
      array: false,
    });
    console.log(`Requested string column ${tableId}.${desired.key}`);
  }

  const contentCol = table.columns.find((col) => col.key === 'content');
  if (contentCol && contentCol.size < 8000) {
    if (!apply) {
      console.log(`dry-run: expand string column ${tableId}.content from ${contentCol.size} to 8000`);
    } else {
      await db.updateStringColumn({
        databaseId,
        tableId,
        key: 'content',
        required: true,
        xdefault: null,
        size: 8000,
      });
      console.log(`Expanded ${tableId}.content size to 8000`);
    }
  } else if (contentCol) {
    console.log(`Column ${tableId}.content already has size ${contentCol.size} (${contentCol.status})`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
