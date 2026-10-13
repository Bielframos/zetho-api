import {
  getStatusAction,
  resolveMaxStatusReached,
  resolveStatusZCoinChanges,
} from './entry-status.policy';

describe('entry status transition policy', () => {
  it('rewards only a newly reached highest progress status', () => {
    expect(resolveStatusZCoinChanges('playing', 'backlog')).toEqual([
      { type: 'input', reason: 'playing_game', amount: 4 },
    ]);
    expect(resolveStatusZCoinChanges('backlog', 'playing')).toEqual([]);
    expect(resolveStatusZCoinChanges('wishlist', null)).toEqual([]);
  });

  it('retains the highest status reached while counters follow the current status', () => {
    expect(resolveMaxStatusReached('completed', 'dropped')).toBe('completed');
    expect(resolveMaxStatusReached('backlog', 'playing')).toBe('playing');
    expect(getStatusAction('completed', 'completed', 'dropped')).toBe(
      'decrement',
    );
    expect(getStatusAction('playing', 'backlog', 'playing')).toBe('increment');
  });
});
