const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalConfig } = require('./prepare-appwrite-config');

test('creates a local schema config without deployable functions or team membership data', () => {
  const source = {
    projectId: 'production-project',
    functions: [{ $id: 'gamer_scout' }],
    users: [{ $id: 'production-user' }],
    tablesDB: [{ $id: 'app' }],
    tables: [{ $id: 'user_profiles', $permissions: ['read("team:zerei")'] }],
    buckets: [{ $id: 'zerei-medias' }],
    teams: [
      {
        $id: 'zerei',
        name: 'Zerei',
        total: 1,
        prefs: { productionOnly: true },
        memberships: [{ userId: 'production-user' }],
      },
    ],
  };

  const config = createLocalConfig(source, {
    APPWRITE_PROJECT: 'local-project',
    APPWRITE_ENDPOINT: 'https://cloud.example/v1',
  });

  assert.deepEqual(config, {
    projectId: 'local-project',
    endpoint: 'https://cloud.example/v1',
    tablesDB: [{ $id: 'app' }],
    tables: [{ $id: 'user_profiles', $permissions: ['read("team:zerei")'] }],
    buckets: [{ $id: 'zerei-medias' }],
    teams: [{ $id: 'zerei', name: 'Zerei' }],
  });
  assert.equal('functions' in config, false);
  assert.equal('users' in config, false);
});

test('requires an explicit project and endpoint', () => {
  assert.throws(
    () =>
      createLocalConfig({}, { APPWRITE_PROJECT: '  ', APPWRITE_ENDPOINT: '' }),
    /APPWRITE_PROJECT/,
  );
  assert.throws(
    () =>
      createLocalConfig(
        {},
        {
          APPWRITE_PROJECT: 'local-project',
          APPWRITE_ENDPOINT: ' ',
        },
      ),
    /APPWRITE_ENDPOINT/,
  );
});
