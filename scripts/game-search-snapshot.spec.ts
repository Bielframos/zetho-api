import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSnapshot } from './game-search-snapshot';

it('reads complete snapshots containing Unicode line separators in descriptions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-snapshot-'));
  try {
    const rows = [
      { $id: '1', summary: 'First\u2028second\u2029third\nlast' },
      { $id: '2', summary: 'Valid' },
    ];
    const file = join(dir, 'snapshot.ndjson');
    writeFileSync(
      file,
      rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    );
    const parsed: Record<string, any>[] = [];
    for await (const row of readSnapshot(file)) parsed.push(row);
    expect(parsed).toEqual(rows);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
