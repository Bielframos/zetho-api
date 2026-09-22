import crypto from 'node:crypto';

export type Row = Record<string, any> & {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
};
export type Snapshot = {
  entries: Row[];
  reads: Row[];
  profiles: Row[];
  gameCounts: Row[];
  ledger: Row[];
};
export type Change = {
  table: 'z_entries_read' | 'user_profiles' | 'z_entry_count';
  id: string;
  before: Row | null;
  data: Record<string, any>;
};
export type Plan = {
  blockers: string[];
  changes: Change[];
  pendingIds: string[];
  counts: Record<string, number>;
};
const statuses = ['completed', 'backlog', 'dropped', 'playing', 'wishlist'];
const rank: Record<string, number> = { backlog: 1, playing: 2, completed: 3 };
const normalized = (v: any): any =>
  Array.isArray(v)
    ? v.map(normalized)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, normalized(v[k])]),
        )
      : v;
export const hash = (v: unknown) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized(v)))
    .digest('hex');
export const readId = (owner: string, game: string) =>
  crypto
    .createHash('sha256')
    .update(`${owner}_${game}`)
    .digest('hex')
    .slice(0, 32);
export const relationId = (v: any): string | null =>
  typeof v === 'string' ? v : (v?.$id ?? null);
// Appwrite expands relationships in transactional getRow responses, even when
// listRows/getRow outside the transaction return only the related row ID.
export const comparableRow = (table: string, row: Row) =>
  table === 'z_entry_count' ? { ...row, game: relationId(row.game) } : row;
export const canonical = (s: Snapshot) =>
  Object.fromEntries(
    Object.entries(s).map(([table, rows]) => [
      table,
      [...rows].sort((a, b) => a.$id.localeCompare(b.$id)),
    ]),
  );
export const snapshotHash = (s: Snapshot) => hash(canonical(s));
const fields = [
  'status',
  'liked',
  'hyped',
  'playedPlatform',
  'completionType',
  'playtimeMinutes',
  'likedEver',
  'maxStatusReached',
];
const profileFields = [
  ...statuses.map((s) => `totals${s[0].toUpperCase()}${s.slice(1)}`),
  'totalsHyped',
];
const gameFields = [
  ...statuses.map((s) => `${s}Count`),
  'likes',
  'hypedCount',
  'completedPlaytimeMinutes',
  'completedPlaytimeCount',
];
// Updating an old Appwrite row materializes these numeric defaults. Only
// null -> 0 in derived counters is equivalent; other fields stay exact.
export function materializedCounterDefaults(before: Row, after: Row): Row {
  const normalized = { ...before };
  for (const field of gameFields)
    if (before[field] === null && after[field] === 0) normalized[field] = 0;
  return normalized;
}
const key = (v: Row) => `${v.ownerFingerprint}\u0000${v.gameId}`;
const minutes = (r: Row) =>
  r.status === 'completed' &&
  Number.isSafeInteger(r.playtimeMinutes) &&
  r.playtimeMinutes > 0
    ? r.playtimeMinutes
    : 0;
const isSame = (a: any, b: any) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function planSnapshot(s: Snapshot): Plan {
  const blockers: string[] = [],
    changes: Change[] = [],
    pendingIds: string[] = [];
  const histories = new Map<string, Row[]>();
  for (const e of s.entries)
    histories.set(key(e), [...(histories.get(key(e)) ?? []), e]);
  const reads = new Map(s.reads.map((r) => [r.$id, r]));
  const readsByKey = new Map<string, Row[]>();
  for (const r of s.reads)
    readsByKey.set(key(r), [...(readsByKey.get(key(r)) ?? []), r]);
  for (const [readKey, duplicates] of readsByKey)
    if (duplicates.length !== 1)
      blockers.push(`Duplicate read rows for ${readKey}`);
  const profiles = new Map<string, Row[]>();
  for (const p of s.profiles)
    profiles.set(p.fingerprint, [...(profiles.get(p.fingerprint) ?? []), p]);
  const games = new Map<string, Row[]>();
  for (const g of s.gameCounts) {
    const id = relationId(g.game);
    if (id) games.set(id, [...(games.get(id) ?? []), g]);
    else blockers.push(`Game counter ${g.$id} has no game relation`);
  }
  const projected = new Map(reads);
  let groups = 0;
  for (const [groupKey, history] of histories) {
    history.sort(
      (a, b) =>
        String(a.$createdAt).localeCompare(String(b.$createdAt)) ||
        a.$id.localeCompare(b.$id),
    );
    const pending = history.filter((e) => !e.processedAt);
    if (!pending.length) continue;
    groups++;
    pendingIds.push(...pending.map((e) => e.$id));
    const latest = history.at(-1)!;
    const id = readId(latest.ownerFingerprint, latest.gameId);
    const before = reads.get(id) ?? null;
    for (const candidate of readsByKey.get(groupKey) ?? [])
      if (candidate.$id !== id)
        blockers.push(`Noncanonical read ID ${candidate.$id} for ${groupKey}`);
    if (before && key(before) !== groupKey)
      blockers.push(`Read ${id} has another owner/game`);
    if ((profiles.get(latest.ownerFingerprint) ?? []).length !== 1)
      blockers.push(
        `Profile missing or ambiguous for ${latest.ownerFingerprint}`,
      );
    if ((games.get(latest.gameId) ?? []).length !== 1)
      blockers.push(`Game counter missing or ambiguous for ${latest.gameId}`);
    const historicalRank = Math.max(
      0,
      ...history.map((e) => rank[e.status] ?? 0),
    );
    const existingRank = rank[before?.maxStatusReached] ?? 0;
    const maxRank = Math.max(historicalRank, existingRank);
    const after: Row = {
      $id: id,
      ownerFingerprint: latest.ownerFingerprint,
      gameId: latest.gameId,
      status: latest.status ?? null,
      liked: latest.liked ?? null,
      hyped: latest.hyped ?? false,
      playedPlatform: latest.playedPlatform ?? null,
      completionType:
        latest.status === 'completed' ? (latest.completionType ?? null) : null,
      playtimeMinutes: latest.playtimeMinutes ?? null,
      likedEver:
        before?.likedEver === true || history.some((e) => e.liked === true),
      maxStatusReached:
        Object.entries(rank).find(([, v]) => v === maxRank)?.[0] ?? null,
    };
    projected.set(id, after);
    const data = Object.fromEntries(
      [...fields, 'ownerFingerprint', 'gameId']
        .filter((f) => !before || !isSame(before[f], after[f]))
        .map((f) => [f, after[f]]),
    );
    if (Object.keys(data).length)
      changes.push({ table: 'z_entries_read', id, before, data });
  }
  // All current projections determine absolute counters, including groups without pending events.
  const profileTotals = new Map<string, Record<string, number>>();
  const gameTotals = new Map<string, Record<string, number>>();
  for (const r of projected.values()) {
    const owner = profiles.get(r.ownerFingerprint) ?? [];
    if (owner.length !== 1) {
      blockers.push(`Read ${r.$id} lacks a unique profile`);
      continue;
    }
    if ((games.get(r.gameId) ?? []).length !== 1) {
      blockers.push(`Read ${r.$id} lacks a unique game counter`);
      continue;
    }
    const p =
      profileTotals.get(owner[0].$id) ??
      Object.fromEntries(profileFields.map((f) => [f, 0]));
    const g =
      gameTotals.get(r.gameId) ??
      Object.fromEntries(gameFields.map((f) => [f, 0]));
    if (statuses.includes(r.status)) {
      p[`totals${r.status[0].toUpperCase()}${r.status.slice(1)}`]++;
      g[`${r.status}Count`]++;
    }
    if (r.liked === true) g.likes++;
    if (r.hyped === true) {
      p.totalsHyped++;
      g.hypedCount++;
    }
    const m = minutes(r);
    if (m) {
      g.completedPlaytimeMinutes += m;
      g.completedPlaytimeCount++;
    }
    profileTotals.set(owner[0].$id, p);
    gameTotals.set(r.gameId, g);
  }
  for (const p of s.profiles) {
    const expected =
      profileTotals.get(p.$id) ??
      Object.fromEntries(profileFields.map((f) => [f, 0]));
    const data = Object.fromEntries(
      profileFields
        .filter((f) => !isSame(p[f] ?? 0, expected[f]))
        .map((f) => [f, expected[f]]),
    );
    if (Object.keys(data).length)
      changes.push({ table: 'user_profiles', id: p.$id, before: p, data });
  }
  for (const g of s.gameCounts) {
    const expected =
      gameTotals.get(relationId(g.game) ?? '') ??
      Object.fromEntries(gameFields.map((f) => [f, 0]));
    const data = Object.fromEntries(
      gameFields
        .filter((f) => !isSame(g[f] ?? 0, expected[f]))
        .map((f) => [f, expected[f]]),
    );
    if (Object.keys(data).length)
      changes.push({ table: 'z_entry_count', id: g.$id, before: g, data });
  }
  return {
    blockers: [...new Set(blockers)],
    changes,
    pendingIds: pendingIds.sort(),
    counts: {
      entries: s.entries.length,
      pending: pendingIds.length,
      groups,
      changes: changes.length,
    },
  };
}
