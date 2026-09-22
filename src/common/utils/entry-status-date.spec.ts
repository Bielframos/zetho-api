import { statusChangedAtFromHistory } from './entry-status-date';
const event = ($id: string, status: string | null, $createdAt: string) => ({
  $id,
  status,
  $createdAt,
});
describe('statusChangedAtFromHistory', () => {
  it('preserves the transition across later snapshots and uses the last real transition', () => {
    expect(
      statusChangedAtFromHistory([
        event('d', 'completed', '2026-02-01T00:00:00Z'),
        event('a', 'completed', '2024-01-01T00:00:00Z'),
        event('b', 'completed', '2025-01-01T00:00:00Z'),
        event('c', 'playing', '2026-01-01T00:00:00Z'),
        event('e', 'completed', '2026-03-01T00:00:00Z'),
      ]),
    ).toBe('2026-02-01T00:00:00.000Z');
  });
  it('keeps unknown history and cleared status undated', () => {
    expect(statusChangedAtFromHistory([])).toBeNull();
    expect(
      statusChangedAtFromHistory([event('a', 'completed', 'bad')]),
    ).toBeNull();
    expect(
      statusChangedAtFromHistory([event('a', null, '2026-01-01T00:00:00Z')]),
    ).toBeNull();
  });
  it('uses IDs to break equal timestamps', () => {
    expect(
      statusChangedAtFromHistory([
        event('b', null, '2026-01-01T00:00:00Z'),
        event('a', 'completed', '2026-01-01T00:00:00Z'),
      ]),
    ).toBeNull();
  });
});
