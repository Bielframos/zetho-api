const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEMO_ROWS,
  getTarget,
  main,
  parseArgs,
  seedCatalog,
} = require('./seed-demo');

test('defaults to a dry run and requires an explicit remote opt-in', () => {
  assert.deepEqual(parseArgs([]), { apply: false, allowRemote: false });
  assert.deepEqual(parseArgs(['--dry-run']), {
    apply: false,
    allowRemote: false,
  });
  assert.deepEqual(parseArgs(['--apply', '--allow-remote']), {
    apply: true,
    allowRemote: true,
  });
  assert.throws(() => parseArgs(['--apply', '--dry-run']), /Choose either/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);

  assert.deepEqual(
    getTarget(
      {
        APPWRITE_ENDPOINT: 'http://localhost/v1',
        APPWRITE_PROJECT: 'local',
      },
      false,
    ),
    { endpoint: 'http://localhost/v1', projectId: 'local' },
  );
  assert.throws(
    () =>
      getTarget(
        {
          APPWRITE_ENDPOINT: 'https://cloud.example/v1',
          APPWRITE_PROJECT: 'remote',
        },
        false,
      ),
    /--allow-remote/,
  );
  assert.throws(
    () =>
      getTarget(
        {
          APPWRITE_ENDPOINT: 'https://user:secret@localhost/v1',
          APPWRITE_PROJECT: 'local',
        },
        false,
      ),
    /must not include a username or password/,
  );
  assert.equal(
    getTarget(
      {
        APPWRITE_ENDPOINT: 'https://cloud.example/v1',
        APPWRITE_PROJECT: 'remote',
      },
      true,
    ).projectId,
    'remote',
  );
});

test('dry run plans fictional catalog rows without making SDK calls', async () => {
  let calls = 0;
  const result = await seedCatalog(
    {
      getRow: async () => calls++,
      createRow: async () => calls++,
    },
    { dryRun: true },
  );

  assert.deepEqual(result, { planned: 7, created: 0, alreadyExists: 0 });
  assert.equal(calls, 0);
  assert.equal(DEMO_ROWS.length, 7);
  assert.ok(DEMO_ROWS.every(({ data }) => !('coverUrl' in data)));
  assert.ok(DEMO_ROWS.every(({ data }) => !('userId' in data)));
  const games = DEMO_ROWS.filter(({ tableId }) => tableId === 'games');
  assert.equal(games.length, 3);
  for (const { data } of games) {
    assert.equal(data.syncStage, 'full');
    assert.equal(data.searchIndexVersion, 1);
    assert.equal(
      data.searchName,
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    );
    const token = data.name.includes('Starlit')
      ? 'starlit'
      : data.name.includes('Lanterns')
        ? 'lanterns'
        : 'clockwork';
    assert.ok(
      data.searchText.includes(`zt${Buffer.from(token).toString('hex')}`),
    );
  }
  const stats = DEMO_ROWS.filter(({ tableId }) => tableId === 'z_entry_count');
  assert.equal(stats.length, games.length);
  assert.deepEqual(
    stats.map(({ data }) => data.game),
    games.map(({ rowId }) => rowId),
  );
});

test('CLI dry run does not require an API key', async () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    const result = await main([], {
      APPWRITE_ENDPOINT: 'http://127.0.0.1/v1',
      APPWRITE_PROJECT: 'local-project',
    });
    assert.equal(result.planned, DEMO_ROWS.length);
  } finally {
    console.log = originalLog;
  }
});

test('apply creates only missing rows and never overwrites existing rows', async () => {
  const existing = new Set(['game_types/demo-adventure']);
  const calls = [];
  const tablesDB = {
    async getRow({ tableId, rowId }) {
      calls.push(['get', tableId, rowId]);
      if (!existing.has(`${tableId}/${rowId}`)) {
        const error = new Error('Not found');
        error.code = 404;
        throw error;
      }
      return { $id: rowId };
    },
    async createRow(input) {
      calls.push(['create', input.tableId, input.rowId, input.permissions]);
      existing.add(`${input.tableId}/${input.rowId}`);
    },
    async updateRow() {
      throw new Error('seed must not update rows');
    },
  };

  const first = await seedCatalog(tablesDB, { dryRun: false });
  assert.deepEqual(first, { planned: 0, created: 6, alreadyExists: 1 });
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 6);
  assert.ok(
    calls
      .filter(([kind]) => kind === 'create')
      .every(([, , , permissions]) => permissions.includes('read("any")')),
  );

  calls.length = 0;
  const second = await seedCatalog(tablesDB, { dryRun: false });
  assert.deepEqual(second, { planned: 0, created: 0, alreadyExists: 7 });
  assert.ok(calls.every(([kind]) => kind === 'get'));
});

test('apply propagates errors other than row not found', async () => {
  const tablesDB = {
    async getRow() {
      const error = new Error('Unauthorized');
      error.code = 401;
      throw error;
    },
    async createRow() {
      throw new Error('should not create after a non-404 error');
    },
  };

  await assert.rejects(
    seedCatalog(tablesDB, { dryRun: false }),
    /Unauthorized/,
  );
});
