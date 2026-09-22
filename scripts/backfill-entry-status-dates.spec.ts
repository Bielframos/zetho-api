import { writeStatusDate } from './backfill-entry-status-dates';
const before = {
  $id: 'r',
  $updatedAt: '2026-01-01T00:00:00Z',
  status: 'completed',
};
function mock(current: any = before) {
  return {
    createTransaction: jest.fn().mockResolvedValue({ $id: 'tx' }),
    getRow: jest.fn().mockResolvedValue(current),
    updateRow: jest.fn().mockResolvedValue({}),
    updateTransaction: jest.fn().mockResolvedValue({}),
  };
}
test('backfill refuses an updated projection', async () => {
  const db = mock({ ...before, $updatedAt: '2026-02-01T00:00:00Z' });
  expect(
    await writeStatusDate(db as any, before as any, '2025-01-01T00:00:00Z'),
  ).toBe(false);
  expect(db.updateRow).not.toHaveBeenCalled();
  expect(db.updateTransaction).toHaveBeenCalledWith({
    transactionId: 'tx',
    rollback: true,
  });
});
test('backfill writes only the date inside the transaction', async () => {
  const db = mock();
  expect(
    await writeStatusDate(db as any, before as any, '2025-01-01T00:00:00Z'),
  ).toBe(true);
  expect(db.updateRow).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { statusChangedAt: '2025-01-01T00:00:00Z' },
      transactionId: 'tx',
    }),
  );
});
test('backfill propagates commit conflicts and rolls back', async () => {
  const db = mock();
  db.updateTransaction.mockRejectedValueOnce(new Error('conflict'));
  await expect(
    writeStatusDate(db as any, before as any, '2025-01-01T00:00:00Z'),
  ).rejects.toThrow('conflict');
  expect(db.updateTransaction).toHaveBeenLastCalledWith({
    transactionId: 'tx',
    rollback: true,
  });
});
