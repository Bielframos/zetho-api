/** Adds only the catalog reference; never updates or deletes existing schema/data. */
require('dotenv/config');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client, TablesDB } = require('node-appwrite');
const config = require('../appwrite.config.json');
const apply = process.argv.includes('--apply');
const tables = ['z_entries', 'z_entries_read'];
const key = 'playedPlatformId';
const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT).setKey(process.env.APPWRITE_API_KEY);
const db = new TablesDB(client);
const fields = ['key', 'type', 'required', 'array', 'default', 'size', 'encrypt', 'format', 'elements', 'min', 'max'];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
function compareColumn(expected, actual) {
  for (const field of fields) {
    if (expected[field] === undefined) continue;
    const normalize = value => field === 'encrypt' ? value ?? false : value;
    assert.deepEqual(canonical(normalize(actual[field])), canonical(normalize(expected[field])), `${expected.key}.${field} drift`);
  }
  assert.equal(actual.status, 'available', `${actual.key} is not available`);
}
async function inspect(id) {
  const local = config.tables.find(t => t.databaseId === 'app' && t.$id === id);
  const remote = await db.getTable({ databaseId: 'app', tableId: id });
  for (const field of ['name', 'enabled', 'rowSecurity', '$permissions']) assert.deepEqual(remote[field], local[field], `${id}.${field} drift`);
  for (const col of remote.columns) {
    const expected = local.columns.find(c => c.key === col.key);
    assert(expected, `${id}.${col.key} absent in config`);
    compareColumn(expected, col);
  }
  const missing = local.columns.filter(c => !remote.columns.some(r => r.key === c.key));
  assert(missing.every(c => c.key === key), `${id}: unexpected missing columns`);
  const index = item => ({ key: item.key, type: item.type, columns: item.columns, orders: item.orders?.length ? item.orders : (item.columns ?? []).map(() => 'ASC') });
  assert.deepEqual(remote.indexes.map(index).sort((a,b)=>a.key.localeCompare(b.key)), local.indexes.map(index).sort((a,b)=>a.key.localeCompare(b.key)), `${id}: index drift`);
  const desired = local.columns.find(c => c.key === key);
  assert.equal(desired.type, 'string'); assert.equal(desired.size, 36); assert.equal(desired.required, false); assert.equal(desired.array, false);
  return { id, remote, missing: missing.length > 0 };
}
(async () => {
  const before = [];
  for (const id of tables) before.push(await inspect(id));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', schemaValidated: true, additions: before.filter(t=>t.missing).map(t=>`${t.id}.${key}`) }));
  if (!apply) return;
  const backupArg = process.argv.find(arg => arg.startsWith('--backup='));
  assert(backupArg, '--apply requires --backup=/path/to/new-file.json');
  fs.writeFileSync(backupArg.slice(9), JSON.stringify({ project: process.env.APPWRITE_PROJECT, endpoint: process.env.APPWRITE_ENDPOINT, capturedAt: new Date().toISOString(), tables: before.map(t=>t.remote) }, null, 2), { flag: 'wx', mode: 0o600 });
  for (const table of before.filter(t=>t.missing)) {
    // Re-check immediately before adding; no push/deploy or destructive operations.
    const checked = await inspect(table.id);
    if (checked.missing) await db.createStringColumn({ databaseId: 'app', tableId: table.id, key, size: 36, required: false, array: false, encrypt: false });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const live = await db.getTable({ databaseId: 'app', tableId: table.id });
      const column = live.columns.find(c=>c.key===key);
      if (column?.status === 'available') { ready = true; break; }
      if (column?.status === 'failed') throw Error(`${table.id}.${key} failed`);
      await new Promise(resolve=>setTimeout(resolve, 1000));
    }
    assert(ready, `${table.id}.${key} not ready; do not remove/recreate it`);
  }
  for (const id of tables) assert.equal((await inspect(id)).missing, false);
  console.log(JSON.stringify({ schemaValidated: true, additionsAvailable: true, existingDataUnchanged: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
