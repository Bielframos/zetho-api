import crypto from 'node:crypto';
import {
  hash,
  comparableRow,
  materializedCounterDefaults,
  planSnapshot,
  readId,
  type Row,
  type Snapshot,
} from './entry-reconciliation-core';
const row = (id: string, data: Record<string, any> = {}): Row => ({
  $id: id,
  $createdAt: '2025-01-01T00:00:00Z',
  $updatedAt: '2025-01-01T00:00:00Z',
  ...data,
});
const base = (): Snapshot => ({
  entries: [],
  reads: [],
  profiles: [row('p', { fingerprint: 'u', zcoinBalance: 17 })],
  gameCounts: [row('c', { game: 'g' })],
  ledger: [row('coin', { amount: 17 })],
});
test('only null derived counters may materialize zero defaults', () => {
  const before = row('c', {
    likes: null,
    completedPlaytimeCount: null,
    ratingCount: null,
    game: 'g',
  });
  const after = { ...before, likes: 0, completedPlaytimeCount: 0 };
  expect(materializedCounterDefaults(before, after)).toEqual(after);
  expect(
    materializedCounterDefaults(before, { ...after, likes: 1 }).likes,
  ).toBeNull();
  expect(
    materializedCounterDefaults(before, { ...after, ratingCount: 0 })
      .ratingCount,
  ).toBeNull();
});
test('transactional relation expansion preserves identity but never hides counter changes', () => {
  const original = row('counter', { game: 'g', likes: 4 });
  const expanded = { ...original, game: { $id: 'g', name: 'Game' } };
  expect(hash(comparableRow('z_entry_count', original))).toBe(
    hash(comparableRow('z_entry_count', expanded)),
  );
  expect(hash(comparableRow('z_entry_count', original))).not.toBe(
    hash(comparableRow('z_entry_count', { ...expanded, likes: 5 })),
  );
  expect(hash(comparableRow('z_entry_count', original))).not.toBe(
    hash(
      comparableRow('z_entry_count', { ...expanded, game: { $id: 'other' } }),
    ),
  );
});
test('legacy pending already reflected leaves coin data and projection alone', () => {
  const s = base();
  s.entries = [
    row('e', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'completed',
      liked: true,
      processedAt: null,
    }),
  ];
  s.reads = [
    row(readId('u', 'g'), {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'completed',
      liked: true,
      statusChangedAt: '2025-01-01T00:00:00.000Z',
      hyped: false,
      likedEver: true,
      maxStatusReached: 'completed',
    }),
  ];
  const plan = planSnapshot(s);
  expect(plan.pendingIds).toEqual(['e']);
  expect(plan.changes.every((c) => !('zcoinBalance' in c.data))).toBe(true);
  expect(plan.changes.some((c) => c.table === 'z_entries_read')).toBe(false);
  expect(s.ledger[0].amount).toBe(17);
});
test('out of order pending event uses latest and preserves stronger anti spam state', () => {
  const s = base();
  s.entries = [
    row('early', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'backlog',
      liked: true,
      processedAt: null,
    }),
    row('late', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'playing',
      liked: false,
      processedAt: '2025-01-03',
      $createdAt: '2025-01-02',
    }),
  ];
  s.reads = [
    row(readId('u', 'g'), {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'backlog',
      liked: true,
      likedEver: true,
      maxStatusReached: 'completed',
    }),
  ];
  const plan = planSnapshot(s);
  const fix = plan.changes.find((c) => c.table === 'z_entries_read')!;
  expect(fix.data).toMatchObject({ status: 'playing', liked: false });
  expect(fix.data).not.toHaveProperty('likedEver');
  expect(fix.data).not.toHaveProperty('maxStatusReached');
});
test('current like correction and absolute counts include other reads', () => {
  const s = base();
  s.gameCounts[0].likes = 1;
  s.entries = [
    row('e', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'playing',
      liked: false,
      processedAt: null,
    }),
  ];
  s.profiles.push(row('p2', { fingerprint: 'u2', zcoinBalance: 0 }));
  s.gameCounts.push(row('c2', { game: 'g2' }));
  s.reads = [
    row(readId('u', 'g'), {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'playing',
      liked: true,
    }),
    row('other', {
      ownerFingerprint: 'u2',
      gameId: 'g2',
      status: 'completed',
      liked: true,
    }),
  ];
  const plan = planSnapshot(s);
  expect(plan.blockers).toEqual([]);
  expect(
    plan.changes.find((c) => c.table === 'z_entry_count')?.data,
  ).toMatchObject({ likes: 0, playingCount: 1 });
  expect(plan.changes.find((c) => c.id === 'c2')?.data).toMatchObject({
    likes: 1,
    completedCount: 1,
  });
});

test('read ID matches production raw SHA-256', () => {
  expect(readId('u', 'g')).toBe(
    crypto.createHash('sha256').update('u_g').digest('hex').slice(0, 32),
  );
});
test('hash is stable across Appwrite object key order', () => {
  expect(hash({ $id: 'x', $sequence: 1, nested: { b: 2, a: 1 } })).toBe(
    hash({ nested: { a: 1, b: 2 }, $sequence: 1, $id: 'x' }),
  );
});

test('legacy null and absent counters are already equivalent to zero', () => {
  const s = base();
  s.gameCounts[0].completedPlaytimeMinutes = null;
  s.gameCounts[0].completedPlaytimeCount = null;
  s.profiles[0].totalsHyped = null;
  expect(planSnapshot(s).changes).toEqual([]);
});

test('duplicate and noncanonical reads block repair', () => {
  const s = base();
  s.entries = [
    row('e', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'playing',
      processedAt: null,
    }),
  ];
  s.reads = [
    row(readId('u', 'g'), { ownerFingerprint: 'u', gameId: 'g' }),
    row('wrong', { ownerFingerprint: 'u', gameId: 'g' }),
  ];
  expect(planSnapshot(s).blockers).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Duplicate read'),
      expect.stringContaining('Noncanonical read'),
    ]),
  );
});

test('missing profile and game counter block repair', () => {
  const s: Snapshot = {
    entries: [
      row('e', {
        ownerFingerprint: 'missing',
        gameId: 'missing-game',
        status: 'playing',
        processedAt: null,
      }),
    ],
    reads: [],
    profiles: [],
    gameCounts: [],
    ledger: [],
  };
  expect(planSnapshot(s).blockers).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Profile missing'),
      expect.stringContaining('Game counter missing'),
    ]),
  );
});

test('reconciliation dates the actual transition, not a later liked snapshot', () => {
  const s = base();
  s.entries = [
    row('a', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'completed',
      $createdAt: '2024-12-31T12:00:00Z',
      processedAt: '2024-12-31',
    }),
    row('b', {
      ownerFingerprint: 'u',
      gameId: 'g',
      status: 'completed',
      liked: true,
      $createdAt: '2026-01-01T12:00:00Z',
      processedAt: null,
    }),
  ];
  const plan = planSnapshot(s);
  expect(
    plan.changes.find((c) => c.table === 'z_entries_read')?.data
      .statusChangedAt,
  ).toBe('2024-12-31T12:00:00.000Z');
});
