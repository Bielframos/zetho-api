const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate, permissions } = require('./provision-list-lifecycle.cjs');
test('row permissions separate visibility and publication state', () => {
  assert.deepEqual(
    permissions({ ownerType: 'system', isPublic: true, status: 'draft' }),
    [],
  );
  assert.deepEqual(
    permissions(
      { ownerType: 'user', isPublic: false, status: 'published' },
      'u',
    ),
    ['read("user:u")'],
  );
  assert.deepEqual(
    permissions({ ownerType: 'system', isPublic: true, status: 'published' }),
    ['read("any")'],
  );
});
test('resumes partial legacy imports, preserves item IDs and does not resurrect archived lists', async () => {
  const records = new Map([
    [
      'editorial_drafts/l',
      {
        $id: 'l',
        revision: 'v1',
        status: 'published',
        payload: JSON.stringify({
          title: 'Title',
          description: 'Description',
          criteria: 'Criteria',
          kind: 'thematic',
          items: [
            { gameId: 'g', reason: 'Reason', sources: ['https://example.com'] },
          ],
        }),
      },
    ],
  ]);
  let fail = true;
  const tableChanges = [];
  const write = async ({ tableId, rowId, data, permissions }) => {
    if (tableId === 'list_items' && fail) {
      fail = false;
      throw new Error('interrupted');
    }
    const k = `${tableId}/${rowId}`;
    const row = {
      ...records.get(k),
      $id: rowId,
      ...data,
      ...(permissions ? { $permissions: permissions } : {}),
    };
    records.set(k, row);
    return row;
  };
  const db = {
    getTable: async () => ({}),
    updateTable: async (a) => tableChanges.push(a),
    getRow: async ({ tableId, rowId }) => {
      const r = records.get(`${tableId}/${rowId}`);
      if (!r) throw { code: 404 };
      return r;
    },
    upsertRow: write,
    updateRow: write,
    listRows: async ({ tableId, queries = [] }) => {
      let found = [...records.entries()]
        .filter(([k]) => k.startsWith(tableId + '/'))
        .map(([, v]) => v);
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'equal')
          found = found.filter((r) => q.values.includes(r[q.attribute]));
      }
      return { rows: found };
    },
  };
  await assert.rejects(migrate(db), /interrupted/);
  assert.equal(records.get('lists/l').revision, null);
  await migrate(db);
  assert.equal(records.get('lists/l').revision, 'v1');
  const itemIds = [...records.keys()].filter((k) =>
    k.startsWith('list_items/'),
  );
  assert.equal(itemIds.length, 1);
  records.get('lists/l').status = 'archived';
  await migrate(db);
  assert.deepEqual(
    [...records.keys()].filter((k) => k.startsWith('list_items/')),
    itemIds,
  );
  assert.equal(records.get('lists/l').status, 'archived');
  assert.deepEqual(records.get('lists/l').$permissions, []);
  assert.ok(
    tableChanges.every((t) => t.rowSecurity && t.permissions.length === 0),
  );
});
