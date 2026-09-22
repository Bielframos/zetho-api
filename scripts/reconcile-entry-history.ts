import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import type {
  ZEntries,
  ZEntriesReadOnly,
  UserProfiles,
} from '../src/infra/appwrite/appwrite';

/**
 * Repairs pending legacy entries without replaying events against a newer read
 * model. This tool only reads Appwrite and can write a local plan manifest.
 * It cannot change remote rows or grant Z-Coins.
 */
type Row = Models.Row & Record<string, any>;
type Field =
  | 'status'
  | 'liked'
  | 'hyped'
  | 'playedPlatform'
  | 'completionType'
  | 'playtimeMinutes'
  | 'likedEver'
  | 'maxStatusReached';
type Group = {
  key: string;
  ownerFingerprint: string;
  gameId: string;
  readId: string;
  pendingIds: string[];
  profileId: string;
  before: Record<Field, any> | null;
  after: Record<Field, any>;
  profileDelta: Record<string, number>;
  gameDelta: Record<string, number>;
};
type Manifest = {
  version: 1;
  snapshotHash: string;
  planHash: string;
  createdAt: string;
  counts: Record<string, number>;
  blockers: string[];
  groups: Group[];
};
const db = new Appwrite().tablesDB;
const statuses = [
  'completed',
  'backlog',
  'dropped',
  'playing',
  'wishlist',
] as const;
const reasons = [
  'add_game_to_library',
  'playing_game',
  'finished_game',
  'engaged',
] as const;
const rewards: Record<string, number> = {
  add_game_to_library: 2,
  playing_game: 4,
  finished_game: 6,
  engaged: 1,
};
const rank: Record<string, number> = { backlog: 1, playing: 2, completed: 3 };
const fields: Field[] = [
  'status',
  'liked',
  'hyped',
  'playedPlatform',
  'completionType',
  'playtimeMinutes',
  'likedEver',
  'maxStatusReached',
];
const hash = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyOf = (entry: Pick<ZEntries, 'ownerFingerprint' | 'gameId'>) =>
  `${entry.ownerFingerprint}\u0000${entry.gameId}`;
const readIdOf = (owner: string, gameId: string) =>
  crypto
    .createHash('sha256')
    .update(`${owner}_${gameId}`)
    .digest('hex')
    .slice(0, 32);
const relationId = (value: any): string | null =>
  typeof value === 'string' ? value : (value?.$id ?? null);
const minutes = (row: Record<string, any> | null) =>
  row?.status === 'completed' &&
  Number.isSafeInteger(row.playtimeMinutes) &&
  row.playtimeMinutes > 0
    ? row.playtimeMinutes
    : 0;
const value = (row: Record<string, any> | null, field: string) =>
  row?.[field] ?? (field === 'hyped' || field === 'likedEver' ? false : null);
const stable = (rows: Row[], columns: string[]) =>
  rows
    .map((row) =>
      Object.fromEntries(
        ['$id', '$updatedAt', ...columns].map((column) => [
          column,
          column === 'game' ? relationId(row[column]) : (row[column] ?? null),
        ]),
      ),
    )
    .sort((a, b) => String(a.$id).localeCompare(String(b.$id)));

async function list(tableId: string): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.listRows<Row>({
      databaseId: 'app',
      tableId,
      queries: [
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    rows.push(...page.rows);
    if (page.rows.length < 100) return rows;
    cursor = page.rows.at(-1)!.$id;
  }
}

function expectedState(entries: ZEntries[]): Record<Field, any> {
  let maxStatus: string | null = null;
  let likedEver = false;
  for (const entry of entries) {
    if ((rank[entry.status ?? ''] ?? 0) > (rank[maxStatus ?? ''] ?? 0))
      maxStatus = entry.status;
    likedEver ||= entry.liked === true;
  }
  const latest = entries.at(-1)!;
  return {
    status: latest.status ?? null,
    liked: latest.liked ?? null,
    hyped: latest.hyped ?? false,
    playedPlatform: latest.playedPlatform ?? null,
    completionType:
      latest.status === 'completed' ? (latest.completionType ?? null) : null,
    playtimeMinutes: latest.playtimeMinutes ?? null,
    likedEver,
    maxStatusReached: maxStatus,
  };
}

function deltas(before: Record<Field, any> | null, after: Record<Field, any>) {
  const profileDelta: Record<string, number> = {};
  const gameDelta: Record<string, number> = {};
  for (const status of statuses) {
    const delta =
      Number(after.status === status) - Number(before?.status === status);
    if (delta) {
      profileDelta[`totals${status[0].toUpperCase()}${status.slice(1)}`] =
        delta;
      gameDelta[`${status}Count`] = delta;
    }
  }
  const liked = Number(after.liked === true) - Number(before?.liked === true);
  const hyped = Number(after.hyped === true) - Number(before?.hyped === true);
  const playtime = minutes(after) - minutes(before);
  const playtimeCount =
    Number(minutes(after) > 0) - Number(minutes(before) > 0);
  if (liked) gameDelta.likes = liked;
  if (hyped) {
    profileDelta.totalsHyped = hyped;
    gameDelta.hypedCount = hyped;
  }
  if (playtime) gameDelta.completedPlaytimeMinutes = playtime;
  if (playtimeCount) gameDelta.completedPlaytimeCount = playtimeCount;
  return { profileDelta, gameDelta };
}

function expectedRewards(entries: ZEntries[]) {
  const result: Record<string, number> = Object.fromEntries(
    reasons.map((reason) => [reason, 0]),
  );
  const byKey = new Map<string, ZEntries[]>();
  for (const entry of entries)
    byKey.set(keyOf(entry), [...(byKey.get(keyOf(entry)) ?? []), entry]);
  for (const history of byKey.values()) {
    history.sort(
      (a, b) =>
        a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id),
    );
    let max = 0;
    let liked = false;
    for (const entry of history) {
      const next = rank[entry.status ?? ''] ?? 0;
      if (next > max) {
        const reason = {
          backlog: 'add_game_to_library',
          playing: 'playing_game',
          completed: 'finished_game',
        }[entry.status ?? ''];
        if (reason) result[reason] += rewards[reason];
        max = next;
      }
      if (entry.liked === true && !liked) {
        result.engaged += 1;
        liked = true;
      }
    }
  }
  return result;
}

async function build(): Promise<Manifest> {
  const [entries, reads, profiles, gameCounts, ledger] = await Promise.all([
    list('z_entries'),
    list('z_entries_read'),
    list('user_profiles'),
    list('z_entry_count'),
    list('zcoin_transactions'),
  ]);
  const snapshotHash = hash({
    entries: stable(entries, [
      'ownerFingerprint',
      'gameId',
      '$createdAt',
      'processedAt',
      'status',
      'liked',
      'hyped',
      'playedPlatform',
      'completionType',
      'playtimeMinutes',
    ]),
    reads: stable(reads, ['ownerFingerprint', 'gameId', ...fields]),
    profiles: stable(profiles, [
      'fingerprint',
      'userId',
      'zcoinBalance',
      ...statuses.map(
        (status) => `totals${status[0].toUpperCase()}${status.slice(1)}`,
      ),
      'totalsHyped',
    ]),
    gameCounts: stable(gameCounts, [
      'game',
      ...statuses.map((status) => `${status}Count`),
      'likes',
      'hypedCount',
      'completedPlaytimeMinutes',
      'completedPlaytimeCount',
    ]),
    ledger: stable(ledger, ['userId', 'reason', 'amount']),
  });
  const histories = new Map<string, ZEntries[]>();
  for (const entry of entries as ZEntries[])
    histories.set(keyOf(entry), [
      ...(histories.get(keyOf(entry)) ?? []),
      entry,
    ]);
  const readById = new Map(reads.map((row) => [row.$id, row]));
  const profileByFingerprint = new Map<string, UserProfiles[]>();
  for (const profile of profiles as UserProfiles[])
    profileByFingerprint.set(profile.fingerprint, [
      ...(profileByFingerprint.get(profile.fingerprint) ?? []),
      profile,
    ]);
  const gameById = new Map(
    gameCounts.map((row) => [relationId(row.game), row]),
  );
  const blockers: string[] = [];
  const groups: Group[] = [];
  let outOfOrder = 0;
  for (const [key, history] of histories) {
    history.sort(
      (a, b) =>
        a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id),
    );
    const pending = history.filter((row) => !row.processedAt);
    if (!pending.length) continue;
    const latestProcessed = history.filter((row) => row.processedAt).at(-1);
    outOfOrder += pending.filter(
      (row) =>
        latestProcessed &&
        (latestProcessed.$createdAt > row.$createdAt ||
          (latestProcessed.$createdAt === row.$createdAt &&
            latestProcessed.$id > row.$id)),
    ).length;
    const sample = history[0];
    const profileRows = profileByFingerprint.get(sample.ownerFingerprint) ?? [];
    if (profileRows.length !== 1)
      blockers.push(`Perfil ambíguo ou ausente para ${key}`);
    const readId = readIdOf(sample.ownerFingerprint, sample.gameId);
    const read = readById.get(readId) ?? null;
    if (
      read &&
      (read.ownerFingerprint !== sample.ownerFingerprint ||
        read.gameId !== sample.gameId)
    )
      blockers.push(`Read model com chave divergente: ${readId}`);
    if (!gameById.has(sample.gameId))
      blockers.push(`Contador do jogo ausente: ${sample.gameId}`);
    const before = read
      ? (Object.fromEntries(
          fields.map((field) => [field, value(read, field)]),
        ) as Record<Field, any>)
      : null;
    const after = expectedState(history);
    const { profileDelta, gameDelta } = deltas(before, after);
    groups.push({
      key,
      ownerFingerprint: sample.ownerFingerprint,
      gameId: sample.gameId,
      readId,
      pendingIds: pending.map((row) => row.$id),
      profileId: profileRows[0]?.$id ?? '',
      before,
      after,
      profileDelta,
      gameDelta,
    });
  }
  groups.sort((a, b) => a.key.localeCompare(b.key));
  const affectedUsers = new Set(
    groups
      .map(
        (group) =>
          profileByFingerprint.get(group.ownerFingerprint)?.[0]?.userId,
      )
      .filter(Boolean),
  );
  for (const userId of affectedUsers) {
    const allEntries = (entries as ZEntries[]).filter(
      (entry) =>
        profileByFingerprint.get(entry.ownerFingerprint)?.[0]?.userId ===
        userId,
    );
    const expected = expectedRewards(allEntries);
    const observed: Record<string, number> = Object.fromEntries(
      reasons.map((reason) => [reason, 0]),
    );
    for (const row of ledger)
      if (row.userId === userId && reasons.includes(row.reason))
        observed[row.reason] += row.amount;
    for (const reason of reasons)
      if (expected[reason] !== observed[reason])
        blockers.push(
          `Extrato Z-Coin divergente: userId=${userId}, reason=${reason}, expected=${expected[reason]}, observed=${observed[reason]}`,
        );
  }
  // A counter delta is safe only if counters already represent every current read.
  const profileTotals = new Map<string, Record<string, number>>();
  const gameTotals = new Map<string, Record<string, number>>();
  for (const read of reads) {
    const profileRows = profileByFingerprint.get(read.ownerFingerprint) ?? [];
    if (profileRows.length !== 1) {
      blockers.push(`Read sem perfil único: ${read.$id}`);
      continue;
    }
    const p = profileTotals.get(profileRows[0].$id) ?? {};
    const g = gameTotals.get(read.gameId) ?? {};
    for (const status of statuses)
      if (read.status === status) {
        const pc = `totals${status[0].toUpperCase()}${status.slice(1)}`;
        const gc = `${status}Count`;
        p[pc] = (p[pc] ?? 0) + 1;
        g[gc] = (g[gc] ?? 0) + 1;
      }
    if (read.liked === true) g.likes = (g.likes ?? 0) + 1;
    if (read.hyped === true) {
      p.totalsHyped = (p.totalsHyped ?? 0) + 1;
      g.hypedCount = (g.hypedCount ?? 0) + 1;
    }
    const m = minutes(read);
    if (m) {
      g.completedPlaytimeMinutes = (g.completedPlaytimeMinutes ?? 0) + m;
      g.completedPlaytimeCount = (g.completedPlaytimeCount ?? 0) + 1;
    }
    profileTotals.set(profileRows[0].$id, p);
    gameTotals.set(read.gameId, g);
  }
  for (const profile of profiles) {
    const expected = profileTotals.get(profile.$id) ?? {};
    for (const field of [
      ...statuses.map(
        (status) => `totals${status[0].toUpperCase()}${status.slice(1)}`,
      ),
      'totalsHyped',
    ])
      if (Number(profile[field] ?? 0) !== (expected[field] ?? 0))
        blockers.push(
          `Contador de perfil divergente: ${profile.$id}/${field}, actual=${profile[field]}, expected=${expected[field] ?? 0}`,
        );
  }
  for (const row of gameCounts) {
    const gameId = relationId(row.game);
    if (!gameId) {
      blockers.push(`Contador sem relação de jogo: ${row.$id}`);
      continue;
    }
    const expected = gameTotals.get(gameId) ?? {};
    for (const field of [
      ...statuses.map((status) => `${status}Count`),
      'likes',
      'hypedCount',
      'completedPlaytimeMinutes',
      'completedPlaytimeCount',
    ])
      if (Number(row[field] ?? 0) !== (expected[field] ?? 0))
        blockers.push(
          `Contador de jogo divergente: ${gameId}/${field}, actual=${row[field]}, expected=${expected[field] ?? 0}`,
        );
  }
  const planHash = hash(groups);
  return {
    version: 1,
    snapshotHash,
    planHash,
    createdAt: new Date().toISOString(),
    counts: {
      entries: entries.length,
      pending: groups.reduce((sum, group) => sum + group.pendingIds.length, 0),
      groups: groups.length,
      outOfOrder,
      affectedUsers: affectedUsers.size,
      blockers: blockers.length,
    },
    blockers,
    groups,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 2 ||
    (args.length && (args[0] !== '--plan-out' || !args[1]))
  )
    throw new Error(
      'Only --plan-out <path> is supported; this tool is read-only',
    );
  const outPath = args[1];
  const current = await build();
  console.log(
    JSON.stringify(
      {
        snapshotHash: current.snapshotHash,
        planHash: current.planHash,
        counts: current.counts,
        blockers: current.blockers.slice(0, 30),
        additionalBlockers: Math.max(0, current.blockers.length - 30),
      },
      null,
      2,
    ),
  );
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(current, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(`manifest saved: ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
