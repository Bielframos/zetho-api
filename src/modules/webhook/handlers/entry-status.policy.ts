import type { ZEntriesStatus } from 'src/infra/appwrite/appwrite';
import SCORE_TABLE from 'src/modules/zcoins/score-table';

const STATUS_RANK: Record<string, number> = {
  backlog: 1,
  playing: 2,
  completed: 3,
};

export function getStatusRank(status: string | null): number {
  return status ? (STATUS_RANK[status] ?? 0) : 0;
}

export function resolveStatusZCoinChanges(
  current: string | null,
  maxStatusReached: string | null,
) {
  const reasonByStatus: Partial<
    Record<string, keyof typeof SCORE_TABLE.input>
  > = {
    backlog: 'add_game_to_library',
    playing: 'playing_game',
    completed: 'finished_game',
  };
  const reason = current ? reasonByStatus[current] : undefined;
  if (!reason || getStatusRank(current) <= getStatusRank(maxStatusReached)) {
    return [];
  }
  return [
    { type: 'input' as const, reason, amount: SCORE_TABLE.input[reason] },
  ];
}

export function resolveMaxStatusReached(
  current: string | null,
  candidate: string | null,
): string | null {
  return getStatusRank(candidate) > getStatusRank(current)
    ? candidate
    : current;
}

export function getStatusAction(
  status: `${ZEntriesStatus}`,
  previous?: string | null,
  current?: string | null,
) {
  if (previous !== status && current === status) return 'increment';
  if (previous === status && current !== status) return 'decrement';
  return null;
}
