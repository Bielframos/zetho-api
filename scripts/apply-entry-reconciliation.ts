import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { ENDPOINT, PROJECT_ID } from '../src/infra/appwrite/constants';
import {
  canonical,
  comparableRow,
  materializedCounterDefaults,
  hash,
  planSnapshot,
  snapshotHash,
  type Row,
  type Snapshot,
  type Change,
} from './entry-reconciliation-core';

const db = new Appwrite().tablesDB;
const tables: Record<keyof Snapshot, string> = {
  entries: 'z_entries',
  reads: 'z_entries_read',
  profiles: 'user_profiles',
  gameCounts: 'z_entry_count',
  ledger: 'zcoin_transactions',
};
async function list(tableId: string): Promise<Row[]> {
  const result: Row[] = [];
  let cursor: string | undefined;
  do {
    const page = await db.listRows<Models.Row & Row>({
      databaseId: 'app',
      tableId,
      queries: [
        Query.orderAsc('$id'),
        Query.limit(1000),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    result.push(...page.rows);
    cursor = page.rows.length === 1000 ? page.rows.at(-1)!.$id : undefined;
  } while (cursor);
  return result;
}
async function snapshot(): Promise<Snapshot> {
  const [entries, reads, profiles, gameCounts, ledger] = await Promise.all(
    Object.values(tables).map(list),
  );
  return { entries, reads, profiles, gameCounts, ledger };
}
function writeExclusive(file: string, value: unknown) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function writeJournal(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}
const sourceShape = (s: Snapshot) =>
  s.entries
    .map(({ processedAt, $updatedAt, ...rest }) => rest)
    .sort((a, b) => a.$id.localeCompare(b.$id));
function verifyProcessed(
  before: Snapshot,
  after: Snapshot,
  pending: string[],
  timestamp: string,
  completed: boolean,
) {
  const original = new Map(before.entries.map((r) => [r.$id, r]));
  const pendingSet = new Set(pending);
  for (const r of after.entries) {
    const old = original.get(r.$id);
    if (!old) throw new Error(`Unexpected source ${r.$id}`);
    if (!pendingSet.has(r.$id) && r.processedAt !== old.processedAt)
      throw new Error(`Existing processedAt changed: ${r.$id}`);
    if (
      completed &&
      pendingSet.has(r.$id) &&
      (!r.processedAt || Date.parse(r.processedAt) !== Date.parse(timestamp))
    )
      throw new Error(`Pending source not marked: ${r.$id}`);
  }
}
function verifyChanges(plan: Change[], live: Snapshot) {
  for (const c of plan) {
    const row = lookup(live, c.table, c.id);
    if (!row) throw new Error(`Missing repaired row: ${c.table}/${c.id}`);
    for (const [field, wanted] of Object.entries(c.data))
      if (hash(row[field] ?? null) !== hash(wanted ?? null))
        throw new Error(`Repair mismatch: ${c.table}/${c.id}/${field}`);
  }
}
function verifyUntouched(before: Snapshot, after: Snapshot, applied: Change[]) {
  for (const table of ['reads', 'profiles', 'gameCounts'] as const) {
    const tableName = tables[table];
    const oldRows = new Map(before[table].map((r) => [r.$id, r]));
    const newRows = new Map(after[table].map((r) => [r.$id, r]));
    for (const [id, old] of oldRows) {
      const current = newRows.get(id);
      if (!current) throw new Error(`Missing row ${tableName}/${id}`);
      const allowed = applied.find((c) => c.table === tableName && c.id === id);
      const strip = (row: Row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([k]) =>
              k !== '$updatedAt' &&
              k !== '$sequence' &&
              !(allowed && k in allowed.data),
          ),
        );
      const baseline =
        table === 'gameCounts' && allowed
          ? materializedCounterDefaults(old, current)
          : old;
      if (hash(strip(baseline)) !== hash(strip(current)))
        throw new Error(`Unexpected field change in ${tableName}/${id}`);
    }
    for (const id of newRows.keys())
      if (
        !oldRows.has(id) &&
        !applied.some((c) => c.table === tableName && c.id === id)
      )
        throw new Error(`Unexpected row ${tableName}/${id}`);
  }
}

const balanceShape = (s: Snapshot) =>
  s.profiles
    .map((p) => [p.$id, p.zcoinBalance])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
const ledgerShape = (s: Snapshot) => canonical(s).ledger;
const lookup = (
  s: Snapshot,
  table: Change['table'],
  id: string,
): Row | undefined =>
  (table === 'z_entries_read'
    ? s.reads
    : table === 'user_profiles'
      ? s.profiles
      : s.gameCounts
  ).find((r) => r.$id === id);
async function assertTransactionBaseline(
  change: Change,
  txId: string,
  expected: Row | undefined,
) {
  if (!expected) return; // A createRow with deterministic ID fails if another writer created it.
  const live = await db.getRow<Models.Row & Row>({
    databaseId: 'app',
    tableId: change.table,
    rowId: change.id,
    transactionId: txId,
  });
  if (
    hash(comparableRow(change.table, live)) !==
    hash(comparableRow(change.table, expected))
  )
    throw new Error(`Concurrent change in ${change.table}/${change.id}`);
}
async function transact(changes: Change[], expected: Snapshot) {
  const tx = await db.createTransaction();
  try {
    for (const c of changes)
      await assertTransactionBaseline(
        c,
        tx.$id,
        lookup(expected, c.table, c.id),
      );
    for (const c of changes) {
      if (lookup(expected, c.table, c.id))
        await db.updateRow({
          databaseId: 'app',
          tableId: c.table,
          rowId: c.id,
          data: c.data,
          transactionId: tx.$id,
        });
      else
        await db.createRow({
          databaseId: 'app',
          tableId: c.table,
          rowId: c.id,
          data: c.data,
          transactionId: tx.$id,
        });
    }
    await db.updateTransaction({ transactionId: tx.$id, commit: true });
  } catch (error) {
    await db
      .updateTransaction({ transactionId: tx.$id, rollback: true })
      .catch(() => {});
    throw error;
  }
}
async function markProcessed(
  ids: string[],
  expected: Snapshot,
  timestamp: string,
) {
  const tx = await db.createTransaction();
  try {
    for (const id of ids) {
      const baseline = expected.entries.find((r) => r.$id === id);
      if (!baseline || baseline.processedAt)
        throw new Error(`Pending entry changed: ${id}`);
      const live = await db.getRow<Models.Row & Row>({
        databaseId: 'app',
        tableId: 'z_entries',
        rowId: id,
        transactionId: tx.$id,
      });
      if (hash(live) !== hash(baseline))
        throw new Error(`Concurrent source change: ${id}`);
    }
    for (const id of ids)
      await db.updateRow({
        databaseId: 'app',
        tableId: 'z_entries',
        rowId: id,
        data: { processedAt: timestamp },
        transactionId: tx.$id,
      });
    await db.updateTransaction({ transactionId: tx.$id, commit: true });
  } catch (error) {
    await db
      .updateTransaction({ transactionId: tx.$id, rollback: true })
      .catch(() => {});
    throw error;
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['--plan-out', '--apply'].includes(args[0]))
    throw new Error(
      'Usage: --plan-out <new manifest.json> | --apply <manifest.json>',
    );
  const file = path.resolve(args[1]);
  if (args[0] === '--plan-out') {
    const before = await snapshot(),
      plan = planSnapshot(before);
    const manifest = {
      version: 1,
      target: { endpoint: ENDPOINT, projectId: PROJECT_ID },
      createdAt: new Date().toISOString(),
      snapshotHash: snapshotHash(before),
      before,
      plan,
      planHash: hash(plan),
    };
    writeExclusive(file, manifest);
    console.log(
      JSON.stringify(
        {
          file,
          snapshotHash: manifest.snapshotHash,
          planHash: manifest.planHash,
          counts: plan.counts,
          blockers: plan.blockers,
        },
        null,
        2,
      ),
    );
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    manifest.version !== 1 ||
    manifest.target?.endpoint !== ENDPOINT ||
    manifest.target?.projectId !== PROJECT_ID
  )
    throw new Error('Manifest targets another Appwrite project');
  if (
    manifest.snapshotHash !== snapshotHash(manifest.before) ||
    manifest.planHash !== hash(manifest.plan)
  )
    throw new Error('Manifest integrity check failed');
  const derived = planSnapshot(manifest.before);
  if (hash(derived) !== manifest.planHash || derived.blockers.length)
    throw new Error(`Unsafe plan: ${derived.blockers.join('; ')}`);
  const journalFile = `${file}.journal.json`,
    backupFile = `${file}.backup.json`;
  const all: Change[] = derived.changes;
  const batches: Array<{
    kind: 'projection' | 'counter' | 'processed';
    changes?: Change[];
    ids?: string[];
  }> = [];
  for (const kind of [
    'z_entries_read',
    'user_profiles',
    'z_entry_count',
  ] as const) {
    const matching = all.filter((c) => c.table === kind);
    for (let i = 0; i < matching.length; i += 40)
      batches.push({
        kind: kind === 'z_entries_read' ? 'projection' : 'counter',
        changes: matching.slice(i, i + 40),
      });
  }
  for (let i = 0; i < derived.pendingIds.length; i += 40)
    batches.push({
      kind: 'processed',
      ids: derived.pendingIds.slice(i, i + 40),
    });
  let working: Snapshot;
  let journal: {
    manifestHash: string;
    next: number;
    currentHash: string;
    timestamp: string;
  };
  if (fs.existsSync(journalFile)) {
    working = await snapshot();
    journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    if (
      journal.manifestHash !== manifest.planHash ||
      !fs.existsSync(backupFile)
    )
      throw new Error('Journal or backup mismatch');
    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    if (snapshotHash(backup) !== manifest.snapshotHash)
      throw new Error('Backup mismatch');
  } else {
    working = await snapshot();
    if (snapshotHash(working) !== manifest.snapshotHash)
      throw new Error('Live snapshot differs from plan baseline');
    writeExclusive(backupFile, manifest.before);
    journal = {
      manifestHash: manifest.planHash,
      next: 0,
      currentHash: manifest.snapshotHash,
      timestamp: new Date().toISOString(),
    };
    writeJournal(journalFile, journal);
  }
  if (snapshotHash(working) !== journal.currentHash)
    throw new Error('Live snapshot does not match valid journal checkpoint');
  const applied = batches
    .slice(0, journal.next)
    .flatMap((b) => b.changes ?? []);
  for (let i = journal.next; i < batches.length; i++) {
    const b = batches[i];
    if (b.kind === 'processed') {
      verifyChanges(all, working);
      await markProcessed(b.ids!, working, journal.timestamp);
    } else await transact(b.changes!, working);
    if (b.changes) {
      for (const c of b.changes) {
        const row = await db.getRow<Models.Row & Row>({
          databaseId: 'app',
          tableId: c.table,
          rowId: c.id,
        });
        const rows =
          c.table === 'z_entries_read'
            ? working.reads
            : c.table === 'user_profiles'
              ? working.profiles
              : working.gameCounts;
        const index = rows.findIndex((r) => r.$id === c.id);
        if (index < 0) rows.push(row);
        else rows[index] = row;
      }
      applied.push(...b.changes);
      verifyChanges(b.changes, working);
    } else {
      for (const id of b.ids!) {
        const row = await db.getRow<Models.Row & Row>({
          databaseId: 'app',
          tableId: 'z_entries',
          rowId: id,
        });
        const index = working.entries.findIndex((r) => r.$id === id);
        working.entries[index] = row;
      }
    }
    // Source and ledger scans are cheap enough to repeat at phase boundaries.
    if (i === batches.length - 1 || batches[i + 1].kind !== b.kind) {
      const [source, ledger, profiles] = await Promise.all([
        list('z_entries'),
        list('zcoin_transactions'),
        list('user_profiles'),
      ]);
      if (
        hash(sourceShape({ ...working, entries: source })) !==
        hash(sourceShape(manifest.before))
      )
        throw new Error('Source content changed');
      if (hash(ledger) !== hash(manifest.before.ledger))
        throw new Error('Ledger changed');
      if (
        hash(balanceShape({ ...working, profiles })) !==
        hash(balanceShape(manifest.before))
      )
        throw new Error('Balance changed');
      verifyProcessed(
        manifest.before,
        { ...working, entries: source },
        derived.pendingIds,
        journal.timestamp,
        false,
      );
      working.entries = source;
      working.ledger = ledger;
      working.profiles = profiles;
    }
    journal.next = i + 1;
    journal.currentHash = snapshotHash(working);
    writeJournal(journalFile, journal);
    console.log(`Committed batch ${journal.next}/${batches.length}: ${b.kind}`);
  }
  const final = await snapshot(),
    finalPlan = planSnapshot(final);
  verifyProcessed(
    manifest.before,
    final,
    derived.pendingIds,
    journal.timestamp,
    true,
  );
  verifyChanges(all, final);
  verifyUntouched(manifest.before, final, all);
  if (hash(sourceShape(final)) !== hash(sourceShape(manifest.before)))
    throw new Error('Final source content changed');
  if (hash(ledgerShape(final)) !== hash(ledgerShape(manifest.before)))
    throw new Error('Final ledger changed');
  if (hash(balanceShape(final)) !== hash(balanceShape(manifest.before)))
    throw new Error('Final balance changed');
  if (
    finalPlan.pendingIds.length ||
    finalPlan.changes.length ||
    finalPlan.blockers.length
  )
    throw new Error(
      `Final verification failed: ${JSON.stringify(finalPlan.counts)} ${finalPlan.blockers.join('; ')}`,
    );
  console.log(
    JSON.stringify(
      {
        status: 'verified',
        batches: batches.length,
        snapshotHash: snapshotHash(final),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
