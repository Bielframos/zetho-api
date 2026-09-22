import 'dotenv/config';
import crypto from 'crypto';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import type {
  UserProfiles,
  ZCoinTransactions,
  ZEntries,
  ZEntriesReadOnly,
} from '../src/infra/appwrite/appwrite';

// Read-only planning aid. It intentionally has no apply mode or Nest bootstrap.
if (process.argv.length > 2) {
  console.error('No arguments are supported; this audit is read-only.');
  process.exit(2);
}

const db = new Appwrite().tablesDB;
const reasons = [
  'add_game_to_library',
  'playing_game',
  'finished_game',
  'engaged',
] as const;
type Reason = (typeof reasons)[number];
const reward: Record<Reason, number> = {
  add_game_to_library: 2,
  playing_game: 4,
  finished_game: 6,
  engaged: 1,
};
const rank: Record<string, number> = { backlog: 1, playing: 2, completed: 3 };
const rankOf = (status: string | null | undefined) =>
  status ? (rank[status] ?? 0) : 0;
const reasonFor = (status: string | null | undefined): Reason | null =>
  (({
    backlog: 'add_game_to_library',
    playing: 'playing_game',
    completed: 'finished_game',
  })[status ?? ''] as Reason | undefined) ?? null;
const emptyTotals = (): Record<Reason, number> => ({
  add_game_to_library: 0,
  playing_game: 0,
  finished_game: 0,
  engaged: 0,
});

async function* list<T extends Models.Row>(
  tableId: string,
  filters: string[] = [],
): AsyncGenerator<T> {
  let cursor: string | undefined;
  for (;;) {
    const page = await db.listRows<T>({
      databaseId: 'app',
      tableId,
      queries: [
        ...filters,
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const row of page.rows) yield row;
    if (page.rows.length < 100) return;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

async function main() {
  const groups = new Map<string, ZEntries[]>();
  let totalEntries = 0;
  for await (const entry of list<ZEntries>('z_entries')) {
    totalEntries++;
    const key = `${entry.ownerFingerprint}\u0000${entry.gameId}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const reads = new Map<string, ZEntriesReadOnly>();
  for await (const read of list<ZEntriesReadOnly>('z_entries_read')) {
    reads.set(read.$id, read);
  }
  const profiles = new Map<string, UserProfiles[]>();
  for await (const profile of list<UserProfiles>('user_profiles')) {
    const rows = profiles.get(profile.fingerprint) ?? [];
    rows.push(profile);
    profiles.set(profile.fingerprint, rows);
  }

  const report = {
    totalEntries,
    ownerGameGroups: groups.size,
    pending: 0,
    pendingWithoutLaterProcessed: 0,
    pendingWithLaterProcessed: 0,
    affectedGroups: 0,
    readMissing: 0,
    readMismatchCurrentProcessed: 0,
    readMismatchRebuiltAll: 0,
    duplicateTimestamps: 0,
    missingProfile: 0,
    multipleProfiles: 0,
    conflictingCurrentStates: 0,
    ledgerUnattributableUsers: 0,
    expectedRewardsAffectedGroupsOnly: emptyTotals(),
    observedLedgerAffectedUsersAllGames: emptyTotals(),
  };
  const expectedByUser = new Map<string, Record<Reason, number>>();
  const affectedUsers = new Set<string>();

  for (const entries of groups.values()) {
    entries.sort(
      (a, b) =>
        a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id),
    );
    const pending = entries.filter((entry) => !entry.processedAt);
    if (!pending.length) continue;
    report.affectedGroups++;
    const latestProcessed = entries.filter((entry) => entry.processedAt).at(-1);
    const latest = entries.at(-1)!;
    for (const entry of pending) {
      report.pending++;
      if (
        latestProcessed &&
        (latestProcessed.$createdAt > entry.$createdAt ||
          (latestProcessed.$createdAt === entry.$createdAt &&
            latestProcessed.$id > entry.$id))
      )
        report.pendingWithLaterProcessed++;
      else report.pendingWithoutLaterProcessed++;
    }
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].$createdAt === entries[i - 1].$createdAt)
        report.duplicateTimestamps++;
    }

    const readId = crypto
      .createHash('sha256')
      .update(`${latest.ownerFingerprint}_${latest.gameId}`)
      .digest('hex')
      .slice(0, 32);
    const read = reads.get(readId) ?? null;
    if (!read) report.readMissing++;
    const profileRows = profiles.get(latest.ownerFingerprint) ?? [];
    if (!profileRows.length) report.missingProfile++;
    if (profileRows.length > 1) report.multipleProfiles++;
    const userId = profileRows[0]?.userId;
    if (userId) affectedUsers.add(userId);

    let maxRank = 0;
    let maxStatus: string | null = null;
    let likedEver = false;
    const expected = userId
      ? (expectedByUser.get(userId) ?? emptyTotals())
      : null;
    for (const entry of entries) {
      const currentRank = rankOf(entry.status);
      if (currentRank > maxRank) {
        maxRank = currentRank;
        maxStatus = entry.status;
        const reason = reasonFor(entry.status);
        if (reason && expected) expected[reason] += reward[reason];
      }
      if (entry.liked === true && !likedEver) {
        likedEver = true;
        if (expected) expected.engaged += reward.engaged;
      }
    }
    if (expected && userId) expectedByUser.set(userId, expected);

    const matches = (
      entry: ZEntries,
      expectedMax: string | null,
      expectedLikedEver: boolean,
    ) =>
      read?.status === (entry.status ?? null) &&
      read?.liked === (entry.liked ?? null) &&
      read?.hyped === (entry.hyped ?? false) &&
      read?.maxStatusReached === expectedMax &&
      read?.likedEver === expectedLikedEver;
    if (read && !matches(latest, maxStatus, likedEver))
      report.readMismatchRebuiltAll++;
    if (read && latestProcessed) {
      const historical = entries.filter(
        (entry) =>
          entry.$createdAt < latestProcessed.$createdAt ||
          (entry.$createdAt === latestProcessed.$createdAt &&
            entry.$id <= latestProcessed.$id),
      );
      let historicalMax: string | null = null;
      let historicalLiked = false;
      for (const entry of historical) {
        if (rankOf(entry.status) > rankOf(historicalMax))
          historicalMax = entry.status;
        historicalLiked ||= entry.liked === true;
      }
      if (!matches(latestProcessed, historicalMax, historicalLiked))
        report.readMismatchCurrentProcessed++;
      if (
        latestProcessed.$id !== latest.$id &&
        matches(latest, maxStatus, likedEver)
      ) {
        report.conflictingCurrentStates++;
      }
    }
  }

  for (const userId of affectedUsers) {
    const observed = emptyTotals();
    for await (const transaction of list<ZCoinTransactions>(
      'zcoin_transactions',
      [Query.equal('userId', userId)],
    )) {
      if (reasons.includes(transaction.reason as Reason)) {
        observed[transaction.reason as Reason] += transaction.amount;
      }
    }
    const expected = expectedByUser.get(userId) ?? emptyTotals();
    for (const reason of reasons) {
      report.expectedRewardsAffectedGroupsOnly[reason] += expected[reason];
      report.observedLedgerAffectedUsersAllGames[reason] += observed[reason];
    }
    // Ledger rows contain userId and reason, but no owner/game or entry ID.
    report.ledgerUnattributableUsers++;
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        blockers: [
          'All pending entries require chronological reconstruction before writes; the existing handler may inspect future rows when the read model is absent.',
          'Ledger rows cannot be attributed to a specific game or entry. Expected rewards cover affected groups only, while observed transactions cover all games for affected users; these totals must not be compared.',
          'Concurrent writes may change this snapshot; a write pause and fresh audit are required before repair.',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`Audit failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
