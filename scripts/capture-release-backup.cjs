require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client, TablesDB, Query } = require('node-appwrite');

const tables = ['z_entries', 'z_entries_read', 'z_entry_count', 'user_profiles',
  'zcoin_transactions', 'outbox_events', 'feed_events', 'completion_events',
  'annual_goals', 'user_badges', 'ratings', 'rating_votes', 'game_comments',
  'game_comment_votes', 'lists', 'list_items', 'connections', 'saved_lists',
  'list_likes', 'z_entry_likes', 'z_entry_comments'];
const directory = process.argv[2];
if (!directory || process.argv.length !== 3) throw Error('Usage: node scripts/capture-release-backup.cjs <new-directory>');
if (process.env.APPWRITE_PROJECT !== '690a16460002c718253a' || process.env.APPWRITE_ENDPOINT !== 'https://appwrite.adstrito.com/v1') throw Error('Unexpected project');
fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT).setKey(process.env.APPWRITE_API_KEY);
const db = new TablesDB(client);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function write(name, value) {
  const bytes = JSON.stringify(value);
  const file = path.join(directory, name);
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const sha256 = digest(bytes);
  if (digest(fs.readFileSync(file)) !== sha256) throw Error('Backup checksum mismatch');
  return { file: name, sha256, bytes: Buffer.byteLength(bytes) };
}
async function capture(tableId) {
  const schema = await db.getTable({ databaseId: 'app', tableId });
  const rows = [];
  let cursor;
  let expected;
  for (;;) {
    const page = await db.listRows({ databaseId: 'app', tableId, queries: [Query.orderAsc('$id'), Query.limit(1000), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
    expected ??= page.total;
    if (page.total !== expected) throw Error(`Concurrent row count change: ${tableId}`);
    rows.push(...page.rows);
    if (page.rows.length < 1000) break;
    cursor = page.rows.at(-1).$id;
  }
  // This installation caps reported totals at 5000; exhaust the cursor instead.
  if ((expected < 5000 && rows.length !== expected) || rows.length < expected || new Set(rows.map(r => r.$id)).size !== rows.length) throw Error(`Incomplete backup ${tableId}: received ${rows.length}, reported ${expected}`);
  const result = { tableId, count: rows.length, ...write(`${tableId}.json`, { schema, rows }) };
  console.log(JSON.stringify({ tableId, count: result.count, sha256: result.sha256 }));
  return result;
}
(async () => {
  const startedAt = new Date().toISOString();
  const files = [];
  for (let i = 0; i < tables.length; i += 3) files.push(...await Promise.all(tables.slice(i, i + 3).map(capture)));
  const manifest = { project: process.env.APPWRITE_PROJECT, endpoint: process.env.APPWRITE_ENDPOINT, databaseId: 'app', startedAt, finishedAt: new Date().toISOString(), files };
  write('manifest.json', manifest);
  console.log(JSON.stringify({ backup: directory, tables: files.length, verified: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
