/** Run with writes paused. Dry-run is offline; --apply targets only the configured instance. */
const schema = require('../appwrite.config.json');
const { createHash } = require('node:crypto');
const { Client, TablesDB, Query, Permission, Role } = require('node-appwrite');
const relationId = (value) => (typeof value === 'string' ? value : value?.$id);
function permissions(list, userId) {
  return [
    ...(list.ownerType !== 'system' && userId
      ? [Permission.read(Role.user(userId))]
      : []),
    ...(list.isPublic && list.status === 'published'
      ? [Permission.read(Role.any())]
      : []),
  ];
}
async function* rows(db, tableId, queries = []) {
  let cursor;
  for (;;) {
    const page = await db.listRows({
      databaseId: 'app',
      tableId,
      queries: [
        ...queries,
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const row of page.rows) yield row;
    if (page.rows.length < 100) return;
    cursor = page.rows.at(-1).$id;
  }
}
async function configure(db) {
  let ready = true;
  for (const tableId of ['lists', 'list_items']) {
    const desired = schema.tables.find((t) => t.$id === tableId);
    let current = await db.getTable({ databaseId: 'app', tableId });
    for (const column of desired.columns.filter(
      (c) => !current.columns.some((old) => old.key === c.key),
    )) {
      await db.createStringColumn({
        databaseId: 'app',
        tableId,
        key: column.key,
        size: column.size,
        required: false,
        array: column.array,
        default: column.default ?? undefined,
      });
    }
    current = await db.getTable({ databaseId: 'app', tableId });
    if (current.columns.some((c) => c.status !== 'available')) {
      ready = false;
      continue;
    }
    for (const index of desired.indexes.filter(
      (i) => !current.indexes.some((old) => old.key === i.key),
    ))
      await db.createIndex({
        databaseId: 'app',
        tableId,
        key: index.key,
        type: index.type,
        columns: index.columns,
        orders: index.orders,
      });
    current = await db.getTable({ databaseId: 'app', tableId });
    if (current.indexes.some((i) => i.status !== 'available')) ready = false;
  }
  return ready;
}
async function migrate(db) {
  // Restrict table-level access first: a partial migration fails closed.
  for (const tableId of ['lists', 'list_items'])
    await db.updateTable({
      databaseId: 'app',
      tableId,
      name: tableId,
      permissions: [],
      rowSecurity: true,
    });
  // If the previous PR was trialled, import its private drafts, preserving IDs and URLs.
  let legacy = true;
  try {
    await db.getTable({ databaseId: 'app', tableId: 'editorial_drafts' });
  } catch (error) {
    if (error.code !== 404) throw error;
    legacy = false;
  }
  if (legacy)
    for await (const draft of rows(db, 'editorial_drafts')) {
      const content = JSON.parse(draft.payload);
      let existing;
      try {
        existing = await db.getRow({
          databaseId: 'app',
          tableId: 'lists',
          rowId: draft.$id,
        });
      } catch (error) {
        if (error.code !== 404) throw error;
      }
      if (existing && existing.ownerFingerprint !== 'system:zetho')
        throw new Error(
          'List ID collision; resolve manually before continuing.',
        );
      // A prior successful import is authoritative on rerun; never restore withdrawn content.
      if (existing?.ownerType === 'system' && existing.revision) continue;
      const state = draft.status === 'withdrawn' ? 'archived' : draft.status;
      await db.upsertRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: draft.$id,
        permissions: [],
        data: {
          title: content.title,
          description: content.description,
          criteria: content.criteria,
          kind: content.kind,
          month: content.month ?? null,
          ownerType: 'system',
          ownerFingerprint: 'system:zetho',
          status: state,
          isPublic: true,
          slug: `zetho-${draft.$id}`,
          revision: null,
          itemCount: content.items.length,
        },
      });
      const oldItems = [];
      for await (const item of rows(db, 'list_items', [
        Query.equal('list', draft.$id),
      ]))
        oldItems.push(item);
      for (let i = 0; i < content.items.length; i++) {
        const item = content.items[i];
        const old = oldItems.find(
          (row) => relationId(row.game) === item.gameId,
        );
        await db.upsertRow({
          databaseId: 'app',
          tableId: 'list_items',
          rowId:
            old?.$id ??
            createHash('sha256')
              .update(`${draft.$id}:${item.gameId}`)
              .digest('hex')
              .slice(0, 36),
          permissions: [],
          data: {
            list: draft.$id,
            game: item.gameId,
            orderKey: `0|${String(i + 1).padStart(6, '0')}:`,
            reason: item.reason,
            sources: item.sources,
            releaseDate: item.releaseDate ?? null,
          },
        });
      }
      // Only mark complete after all items exist. A failed import can safely resume.
      try {
        await db.getRow({
          databaseId: 'app',
          tableId: 'posts',
          rowId: `ed-${draft.$id}`,
        });
        await db.updateRow({
          databaseId: 'app',
          tableId: 'posts',
          rowId: `ed-${draft.$id}`,
          data: { status: 'draft' },
        });
      } catch (error) {
        if (error.code !== 404) throw error;
      }
      await db.updateRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: draft.$id,
        data: {
          revision: draft.revision,
          lastOrderKey: `0|${String(content.items.length).padStart(6, '0')}:`,
        },
      });
    }
  for await (const original of rows(db, 'lists')) {
    const list = {
      ...original,
      ownerType:
        original.ownerFingerprint === 'system:zetho' ? 'system' : 'user',
      status: original.status ?? 'published',
    };
    let userId;
    if (list.ownerType === 'user') {
      const profiles = await db.listRows({
        databaseId: 'app',
        tableId: 'user_profiles',
        queries: [
          Query.equal('fingerprint', list.ownerFingerprint),
          Query.limit(1),
        ],
      });
      userId = profiles.rows[0]?.userId;
      if (!userId && !list.isPublic)
        throw new Error(
          'Private list without an owner account; resolve ownership before continuing.',
        );
    }
    for await (const item of rows(db, 'list_items', [
      Query.equal('list', list.$id),
    ]))
      await db.updateRow({
        databaseId: 'app',
        tableId: 'list_items',
        rowId: item.$id,
        permissions: userId ? [Permission.read(Role.user(userId))] : [],
        data: {},
      });
    await db.updateRow({
      databaseId: 'app',
      tableId: 'lists',
      rowId: list.$id,
      permissions: permissions(list, userId),
      data: {
        ownerType: list.ownerType,
        status: list.status,
        revision:
          list.revision ?? createHash('sha256').update(list.$id).digest('hex'),
      },
    });
  }
}
async function main() {
  if (!process.argv.includes('--apply')) {
    console.log(
      'Dry run: add lifecycle/editorial fields to lists/items; restrict table permissions; migrate legacy drafts and per-row read permissions. Pause writes for --apply.',
    );
    return;
  }
  require('dotenv/config');
  const db = new TablesDB(
    new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_API_KEY),
  );
  if (!(await configure(db))) {
    console.log(
      'Schema is provisioning. Run again once columns and indexes are available.',
    );
    return;
  }
  await migrate(db);
  console.log(
    'List lifecycle and permissions migrated. Legacy editorial_drafts retained as a backup, no longer used by the application.',
  );
}
module.exports = { permissions, configure, migrate };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
