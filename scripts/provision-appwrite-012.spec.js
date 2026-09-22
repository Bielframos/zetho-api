const {test} = require('node:test');
const assert = require('node:assert/strict');
const {collect} = require('./provision-appwrite-012');

test('reads every table when the server caps pages at 25', async () => {
  const ids = Array.from({length: 37}, (_, i) => ({$id: `table_${i}`}));
  const offsets = [];
  global.fetch = async url => {
    const query = new URL(url).searchParams.getAll('queries[]').map(JSON.parse);
    const offset = query.find(item => item.method === 'offset').values[0];
    offsets.push(offset);
    return {ok:true, text: async () => JSON.stringify({total:37,tables:ids.slice(offset, offset + 25)})};
  };
  const result = await collect('/tablesdb/app/tables', 'tables');
  assert.deepEqual(result, ids);
  assert.deepEqual(offsets, [0,25]);
});
