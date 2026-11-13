import { buildFounderRepairPlan } from './repair-founder-accounts';

describe('Targeted founder sequence correction', () => {
  const users = [
    { $id: 'old', $createdAt: '2025-01-01' },
    { $id: 'duplicate', $createdAt: '2025-01-02' },
    { $id: 'zero', $createdAt: '2025-01-03' },
    { $id: 'new', $createdAt: '2025-01-04' },
  ].map((user) => ({ ...user, emailVerification: true, status: true }));
  it('removes only the specified accounts and closes gaps while preserving Zero and creation order', () => {
    expect(
      buildFounderRepairPlan(users, 'zero', ['duplicate']).map((row) => [
        row.userId,
        row.number,
      ]),
    ).toEqual([
      ['zero', 0],
      ['old', 1],
      ['new', 2],
    ]);
  });
  it('does not reintroduce reservations for unverified or disabled accounts', () => {
    expect(
      buildFounderRepairPlan(
        [
          ...users,
          {
            $id: 'pending',
            $createdAt: '2024-01-01',
            emailVerification: false,
            status: true,
          },
          {
            $id: 'disabled',
            $createdAt: '2024-01-02',
            emailVerification: true,
            status: false,
          },
        ],
        'zero',
        ['duplicate'],
      ).map((row) => row.userId),
    ).toEqual(['zero', 'old', 'new']);
  });
  it('refuses deletion of Zero and refuses a missing Zero account', () => {
    expect(() => buildFounderRepairPlan(users, 'zero', ['zero'])).toThrow();
    expect(() => buildFounderRepairPlan([], 'zero', ['duplicate'])).toThrow();
  });
});
