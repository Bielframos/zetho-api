/** Additive schema migration. Dry-run unless --apply is explicitly supplied. */
require('dotenv/config');
const { Client, TablesDB } = require('node-appwrite');
const db = new TablesDB(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT).setKey(process.env.APPWRITE_API_KEY));
const params = { databaseId: 'app', tableId: 'z_entries_read', key: 'statusChangedAt' };
async function main() {
  const table = await db.getTable({ databaseId: params.databaseId, tableId: params.tableId });
  const column = table.columns.find((item) => item.key === params.key);
  if (column) {
    if (column.type !== 'datetime' || column.required || column.array || column.default != null || column.status !== 'available') throw new Error('statusChangedAt exists with incompatible schema or is not available');
    console.log('statusChangedAt already available');
    return;
  }
  if (!process.argv.includes('--apply')) { console.log('dry-run: add optional datetime z_entries_read.statusChangedAt'); return; }
  await db.createDatetimeColumn({ ...params, required: false, array: false });
  console.log('Column requested. Run this script again to verify availability before deploying the API.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
