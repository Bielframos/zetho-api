/** Private editorial drafts only. No API call without --apply. */
const schema = require('../appwrite.config.json').tables.find(table => table.$id === 'editorial_drafts');
if (!process.argv.includes('--apply')) {
  console.log('Dry run: create editorial_drafts with no client permissions, columns and status index.');
  process.exit(0);
}
require('dotenv/config');
const { Client, TablesDB } = require('node-appwrite');
const db = new TablesDB(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT).setKey(process.env.APPWRITE_API_KEY));
async function main() {
  let table;
  try { table = await db.getTable({ databaseId: 'app', tableId: schema.$id }); }
  catch (error) {
    if (error.code !== 404) throw error;
    table = await db.createTable({ databaseId: 'app', tableId: schema.$id, name: schema.name, permissions: [], rowSecurity: false });
  }
  if (table.$permissions?.length) throw new Error('Refusing a publicly accessible draft table. Review permissions manually.');
  for (const column of schema.columns) {
    if (!table.columns.some(existing => existing.key === column.key))
      await db.createStringColumn({ databaseId: 'app', tableId: schema.$id, key: column.key, size: column.size, required: column.required });
  }
  table = await db.getTable({ databaseId: 'app', tableId: schema.$id });
  if (table.columns.some(column => column.status !== 'available')) {
    console.log('Columns are provisioning. Run again after they become available to add the index.');
    return;
  }
  if (!table.indexes.some(index => index.key === 'status_idx'))
    await db.createIndex({ databaseId: 'app', tableId: schema.$id, key: 'status_idx', type: 'key', columns: ['status'], orders: ['ASC'] });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
