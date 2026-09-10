import { TablesDBIndexType, TablesDB } from 'node-appwrite';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const code = (error: unknown) => (error as { code?: number }).code;
export async function ensureGameSearchSchema(db: TablesDB) {
  const databaseId = 'app';
  const games = { databaseId, tableId: 'games' };
  async function column(
    tableId: string,
    key: string,
    create: () => Promise<unknown>,
  ) {
    try {
      await db.getColumn({ databaseId, tableId, key });
    } catch (error) {
      if (code(error) !== 404) throw error;
      await create();
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      const state = await db.getColumn({ databaseId, tableId, key });
      if (state.status === 'available') return;
      if (state.status === 'failed' || state.status === 'stuck')
        throw new Error(`Column ${tableId}.${key}: ${state.status}`);
      await delay(1000);
    }
    throw new Error(`Column timeout: ${tableId}.${key}`);
  }
  async function varchar(
    tableId: string,
    key: string,
    size: number,
    array = false,
  ) {
    await column(tableId, key, () =>
      db.createVarcharColumn({
        databaseId,
        tableId,
        key,
        size,
        array,
        required: false,
      }),
    );
  }
  async function index(
    tableId: string,
    key: string,
    columns: string[],
    type = TablesDBIndexType.Key,
  ) {
    try {
      await db.getIndex({ databaseId, tableId, key });
    } catch (error) {
      if (code(error) !== 404) throw error;
      await db.createIndex({
        databaseId,
        tableId,
        key,
        type,
        columns,
      });
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      const state = await db.getIndex({ databaseId, tableId, key });
      if (state.status === 'available') return;
      if (state.status === 'failed' || state.status === 'stuck')
        throw new Error(`Index ${tableId}.${key}: ${state.error}`);
      await delay(1000);
    }
    throw new Error(`Index timeout: ${tableId}.${key}`);
  }
  for (const [key, size, array] of [
    ['searchName', 255, false],
    ['searchAliases', 255, true],
    ['developerIds', 36, true],
    ['publisherIds', 36, true],
  ] as const) {
    await varchar('games', key, size, array);
    if (key === 'searchName') await index('games', `games_${key}`, [key]);
  }
  await column('games', 'searchText', () =>
    db.createMediumtextColumn({ ...games, key: 'searchText', required: false }),
  );
  await index(
    'games',
    'games_searchText',
    ['searchText'],
    TablesDBIndexType.Fulltext,
  );
  await column('games', 'searchIndexVersion', () =>
    db.createIntegerColumn({
      ...games,
      key: 'searchIndexVersion',
      required: false,
      min: 0,
    }),
  );
  const stage = (await db.getColumn({
    ...games,
    key: 'syncStage',
  })) as unknown as {
    elements: string[];
    required: boolean;
    default?: string | null;
  };
  if (!stage.elements.includes('search_ready'))
    await db.updateEnumColumn({
      ...games,
      key: 'syncStage',
      elements: [...stage.elements, 'search_ready'],
      required: stage.required,
      // SDK requires an explicit default at runtime even though its type marks it optional.
      xdefault: (stage.default ?? null) as unknown as string,
    });
  const tableId = 'game_search_jobs';
  try {
    await db.getTable({ databaseId, tableId });
  } catch (error) {
    if (code(error) !== 404) throw error;
    await db.createTable({
      databaseId,
      tableId,
      name: 'Game search jobs',
      permissions: [],
      rowSecurity: false,
    });
  }
  for (const [key, size] of [
    ['gameId', 36],
    ['status', 24],
    ['leaseToken', 36],
    ['error', 1000],
  ] as const)
    await varchar(tableId, key, size);
  for (const key of ['externalReference', 'attempts'])
    await column(tableId, key, () =>
      db.createIntegerColumn({
        databaseId,
        tableId,
        key,
        required: false,
        min: 0,
      }),
    );
  await column(tableId, 'availableAt', () =>
    db.createDatetimeColumn({
      databaseId,
      tableId,
      key: 'availableAt',
      required: false,
    }),
  );
  await index(tableId, 'jobs_available', ['availableAt']);
  await index(tableId, 'jobs_status', ['status']);
  console.log('Search schema and indexes available');
}
