#!/usr/bin/env node
/* Additive Appwrite schema provisioner for API 0.12.0 / frontend 1.29.0. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../appwrite.config.json');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const offline = args.includes('--offline');
if (apply && offline) throw Error('--apply and --offline cannot be combined');
const snapshotArg = args.indexOf('--snapshot');
const snapshotPath = snapshotArg < 0 ? path.join(__dirname, 'appwrite-012-baseline.json') : args[snapshotArg + 1];
const snapshot = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), 'utf8'));
const databaseId = 'app';
const intendedTables = new Set(['annual_goals', 'completion_events', 'feed_events', 'user_badges']);
const intendedColumns = {
  games: ['subgenres'], user_profiles: ['showcaseBadges'],
  z_entries: ['playedPlatform', 'completionType', 'playtimeMinutes'],
  z_entries_read: ['playedPlatform', 'completionType', 'playtimeMinutes'],
  z_entry_count: ['completedPlaytimeMinutes', 'completedPlaytimeCount'],
};
const intendedIndexes = {
  z_entries: ['owner_game_pending_chronological'], ratings: ['ratings_ownerFingerprint'],
  gameplay_sessions: ['idx_host_status'],
};
const expectedAdditionsDigest = 'add8dfcf8cff3b6193c1a8e1f3c1be4edc4d11896c774b8e6a8e15d630936b77';
function validateDesiredSchema() {
  const desired = config.tables.filter(t => intendedTables.has(t.$id));
  const additions = config.tables.filter(t => !intendedTables.has(t.$id)).map(t => ({
    $id: t.$id,
    columns: t.columns.filter(c => intendedColumns[t.$id]?.includes(c.key)),
    indexes: t.indexes.filter(i => intendedIndexes[t.$id]?.includes(i.key)),
  })).filter(t => t.columns.length || t.indexes.length);
  const digest = crypto.createHash('sha256').update(JSON.stringify({desired, additions})).digest('hex');
  if (digest !== expectedAdditionsDigest || desired.length !== 4 || by(config.tables, '$id').size !== config.tables.length) {
    throw Error('Desired schema changed since this release provisioner was reviewed');
  }
}
const fields = {
  table: ['$id', 'name', 'enabled', 'rowSecurity', '$permissions'],
  column: ['key', 'type', 'required', 'array', 'default', 'size', 'encrypt', 'format', 'elements', 'min', 'max'],
  index: ['key', 'type', 'columns', 'orders'],
};
const normalize = (value, kind) => Object.fromEntries(fields[kind].filter(k => value[k] !== undefined).map(k => {
  let field = value[k];
  if (kind === 'column' && k === 'encrypt' && field == null) field = false;
  return [k, field];
}));
const semantic = (a, b, kind) => {
  // Appwrite reports an empty order array for indexes with implicit ASC order.
  if (kind === 'index') {
    a = {...a, orders: a.orders?.length ? a.orders : []};
    b = {...b, orders: b.orders?.length ? b.orders : []};
  }
  return JSON.stringify(normalize(a, kind)) === JSON.stringify(normalize(b, kind));
};
const by = (items, key) => new Map(items.map(item => [item[key], item]));
const endpoint = process.env.APPWRITE_ENDPOINT || snapshot.endpoint;
const project = process.env.APPWRITE_PROJECT || snapshot.projectId;
const apiKey = process.env.APPWRITE_API_KEY;
const root = `/tablesdb/${encodeURIComponent(databaseId)}`;
async function request(method, resource, body) {
  const response = await fetch(`${endpoint}${resource}`, {
    method, headers: {'X-Appwrite-Project': project, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw Error(`${method} ${resource}: ${response.status} ${json.message || text}`);
  return json;
}
async function collect(resource, property) {
  const output = [];
  for (let offset = 0; ;) {
    const page = await request('GET', `${resource}?queries[]=${encodeURIComponent(JSON.stringify({method:'limit',values:[100]}))}&queries[]=${encodeURIComponent(JSON.stringify({method:'offset',values:[offset]}))}`);
    output.push(...page[property]);
    if (!Array.isArray(page[property]) || !Number.isInteger(page.total)) throw Error(`Invalid paginated response: ${resource}`);
    if (output.length >= page.total) return output;
    if (!page[property].length) throw Error(`Incomplete pagination: ${resource} at ${offset}`);
    offset += page[property].length;
  }
}
async function liveSchema() {
  const tables = await collect(`${root}/tables`, 'tables');
  const selected = [];
  for (const table of tables) {
    if (!config.tables.some(t => t.$id === table.$id)) { selected.push(table); continue; }
    const id = encodeURIComponent(table.$id);
    const [columns, indexes] = await Promise.all([
      collect(`${root}/tables/${id}/columns`, 'columns'),
      collect(`${root}/tables/${id}/indexes`, 'indexes'),
    ]);
    selected.push({...table, columns, indexes});
  }
  return selected;
}
function plan(remote) {
  const errors = [], operations = [];
  const baseline = by(snapshot.tables, '$id'), current = by(remote, '$id');
  for (const table of remote) if (!baseline.has(table.$id) && !intendedTables.has(table.$id)) errors.push(`Unexpected remote table: ${table.$id}`);
  for (const desired of config.tables) {
    const old = baseline.get(desired.$id), found = current.get(desired.$id);
    if (!old && !intendedTables.has(desired.$id)) continue;
    if (!found) {
      if (old) errors.push(`Existing table disappeared: ${desired.$id}`);
      else {
        operations.push({kind:'table', table: desired});
        for (const column of desired.columns) operations.push({kind:'column', table:desired, value:column});
        for (const index of desired.indexes) operations.push({kind:'index', table:desired, value:index});
      }
      continue;
    }
    if (old && !semantic(found, old, 'table')) errors.push(`Table drift: ${desired.$id}`);
    if (!old && !semantic(found, desired, 'table')) errors.push(`New table conflict: ${desired.$id}`);
    const oldCols = by(old?.columns || [], 'key'), liveCols = by(found.columns, 'key');
    const oldIndexes = by(old?.indexes || [], 'key'), liveIndexes = by(found.indexes, 'key');
    for (const column of desired.columns) {
      const before = oldCols.get(column.key), now = liveCols.get(column.key);
      if (before && (!now || !semantic(now, before, 'column'))) errors.push(`Column drift: ${desired.$id}.${column.key}`);
      if (!before && !now && (intendedTables.has(desired.$id) || intendedColumns[desired.$id]?.includes(column.key))) {
        if (old && column.required) errors.push(`Unsafe required column: ${desired.$id}.${column.key}`);
        else operations.push({kind:'column',table:desired,value:column});
      }
      if (!before && now && !semantic(now, column, 'column')) errors.push(`Column conflict: ${desired.$id}.${column.key}`);
    }
    for (const index of desired.indexes) {
      const before = oldIndexes.get(index.key), now = liveIndexes.get(index.key);
      if (before && (!now || !semantic(now, before, 'index'))) errors.push(`Index drift: ${desired.$id}.${index.key}`);
      if (!before && !now && (intendedTables.has(desired.$id) || intendedIndexes[desired.$id]?.includes(index.key))) operations.push({kind:'index',table:desired,value:index});
      if (!before && now && !semantic(now, index, 'index')) errors.push(`Index conflict: ${desired.$id}.${index.key}`);
    }
  }
  return {errors,operations};
}
async function waitAvailable(resource) {
  for (let n = 0; n < 60; n++) {
    const result = await request('GET', resource);
    if (result.status === 'available') return;
    if (result.status === 'failed' || result.status === 'stuck') throw Error(`${resource}: ${result.status}: ${result.error}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error(`Timed out waiting for ${resource}`);
}
async function execute(op) {
  const tableId = encodeURIComponent(op.table.$id);
  const base = `${root}/tables/${tableId}`;
  if (op.kind === 'table') {
    const t = op.table;
    await request('POST', `${root}/tables`, {tableId:t.$id,name:t.name,permissions:t.$permissions,rowSecurity:t.rowSecurity,enabled:t.enabled});
  } else if (op.kind === 'column') {
    const c = op.value;
    let type = c.type;
    if (c.format === 'enum') type = 'enum';
    if (!['string','integer','boolean','datetime','enum','float'].includes(type)) throw Error(`Unsupported column type ${type}`);
    const body = {key:c.key,required:c.required,array:c.array};
    for (const k of ['default','size','encrypt','format','elements','min','max']) if (c[k] !== undefined) body[k] = c[k];
    if (type === 'enum') delete body.format;
    if (type === 'datetime') delete body.format;
    await request('POST', `${base}/columns/${type}`, body);
    await waitAvailable(`${base}/columns/${encodeURIComponent(c.key)}`);
  } else {
    const i = op.value;
    await request('POST', `${base}/indexes`, {key:i.key,type:i.type,columns:i.columns,orders:i.orders});
    await waitAvailable(`${base}/indexes/${encodeURIComponent(i.key)}`);
  }
}
async function main() {
  validateDesiredSchema();
  if (config.projectId !== snapshot.projectId || !snapshot.endpoint || !snapshot.tables || snapshot.tables.length !== 37 || by(snapshot.tables, '$id').size !== 37) throw Error('Snapshot/project precondition failed');
  if (!offline && (!apiKey || endpoint !== snapshot.endpoint || project !== snapshot.projectId)) throw Error('Live preflight requires matching APPWRITE_ENDPOINT, APPWRITE_PROJECT, and APPWRITE_API_KEY; use --offline for a baseline-only dry run');
  const remote = offline ? snapshot.tables : await liveSchema();
  const initial = plan(remote);
  if (initial.errors.length) throw Error(`Preflight conflicts:\n${initial.errors.join('\n')}`);
  console.log(`${apply ? 'APPLY' : offline ? 'OFFLINE DRY RUN' : 'LIVE DRY RUN'}: ${initial.operations.length} additive operations`);
  for (const op of initial.operations) console.log(`${op.kind} ${op.table.$id}${op.value ? '.' + (op.value.key) : ''}`);
  if (!apply) return;
  for (const op of initial.operations) await execute(op);
  const after = plan(await liveSchema());
  if (after.errors.length || after.operations.length) throw Error(`Postcheck failed: ${[...after.errors,...after.operations.map(o=>`${o.kind} ${o.table.$id}.${o.value?.key}`)].join('; ')}`);
  console.log('Postcheck passed; no remaining additive operations.');
}
if (require.main === module) main().catch(error => {console.error(error.message);process.exitCode=1;});
module.exports = {collect, plan};
