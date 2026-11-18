/* Additive provisioning. With no flags, prints the plan without contacting Appwrite. */
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { AppwriteException, Client, TablesDB } = require('node-appwrite');
const { tables } = require('../appwrite.config.json');
const campaigns = require('./special-themes.json');

const databaseId = 'app';
const desired = ['special_themes', 'special_theme_claims'].map((id) => {
  const table = tables.find(
    (entry) => entry.$id === id && entry.databaseId === databaseId,
  );
  assert(table, `Tabela ${id} não consta no schema.`);
  assert.deepEqual(table.$permissions, []);
  assert.equal(table.rowSecurity, false);
  return table;
});

async function find(read) {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404) return null;
    throw error;
  }
}

async function waitFor(read, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const row = await find(read);
    if (row?.status === 'available') return row;
    if (row?.status === 'failed' || row?.status === 'stuck')
      throw new Error(`${label}: ${row.status}`);
    await delay(1000);
  }
  throw new Error(`${label}: tempo esgotado.`);
}

async function provision(db, table) {
  const scope = { databaseId, tableId: table.$id };
  const current =
    (await find(() => db.getTable(scope))) ??
    (await db.createTable({
      ...scope,
      name: table.name,
      permissions: [],
      rowSecurity: false,
    }));
  assert.deepEqual(
    current.$permissions,
    [],
    `${table.$id}: permissões divergentes.`,
  );
  assert.equal(current.rowSecurity, false);
  assert.equal(current.enabled, true);
  for (const { key, size, type, required, array } of table.columns) {
    const params = { ...scope, key, required, array };
    const read = () => db.getColumn({ ...scope, key });
    if (!(await find(read))) {
      if (type === 'datetime') await db.createDatetimeColumn(params);
      else {
        assert.equal(type, 'string');
        await db.createStringColumn({ ...params, size });
      }
    }
    const column = await waitFor(read, `${table.$id}.${key}`);
    assert.equal(column.type, type);
    assert.equal(column.required, required);
    assert.equal(column.array, array);
    if (type === 'string') assert.equal(column.size, size);
  }
  for (const { key, type, columns, orders } of table.indexes) {
    const read = () => db.getIndex({ ...scope, key });
    if (!(await find(read)))
      await db.createIndex({ ...scope, key, type, columns, orders });
    const index = await waitFor(read, `${table.$id}.${key}`);
    assert.equal(index.type, type);
    assert.deepEqual(index.columns, columns);
  }
}

async function main() {
  for (const { id, name, appearance, startsAt, endsAt } of campaigns) {
    assert.match(id, /^[a-z0-9][a-z0-9-]{0,35}$/);
    assert.match(appearance, /^[a-z0-9][a-z0-9-]{0,35}$/);
    assert(name.trim().length > 0 && name.length <= 255);
    assert(Date.parse(startsAt) < Date.parse(endsAt), `Janela inválida: ${id}`);
  }
  console.log(
    JSON.stringify(
      { tables: desired.map((table) => table.$id), campaigns },
      null,
      2,
    ),
  );
  if (!process.argv.includes('--apply')) return;

  const { APPWRITE_ENDPOINT, APPWRITE_PROJECT, APPWRITE_API_KEY } = process.env;
  assert(
    APPWRITE_ENDPOINT && APPWRITE_PROJECT && APPWRITE_API_KEY,
    'Configure as três variáveis do Appwrite.',
  );
  const db = new TablesDB(
    new Client()
      .setEndpoint(APPWRITE_ENDPOINT)
      .setProject(APPWRITE_PROJECT)
      .setKey(APPWRITE_API_KEY),
  );
  for (const table of desired) await provision(db, table);
  for (const { id, ...data } of campaigns) {
    const scope = { databaseId, tableId: 'special_themes', rowId: id };
    const current = await find(() => db.getRow(scope));
    if (!current) await db.createRow({ ...scope, data });
    else {
      assert.equal(current.name, data.name);
      assert.equal(current.appearance, data.appearance);
      assert.equal(Date.parse(current.startsAt), Date.parse(data.startsAt));
      assert.equal(Date.parse(current.endsAt), Date.parse(data.endsAt));
    }
  }
  console.log('Campanhas de temas especiais disponíveis.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
