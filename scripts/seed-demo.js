#!/usr/bin/env node

const path = require('node:path');

const API_ROOT = path.resolve(__dirname, '..');
const DATABASE_ID = 'app';
const PUBLIC_READ = ['read("any")'];
const SEARCH_INDEX_VERSION = 1;

function normalizeSearchName(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[.'’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchToken(value) {
  return `zt${Buffer.from(value, 'utf8').toString('hex')}`;
}

function buildSearchMetadata(name) {
  const searchName = normalizeSearchName(name);
  const terms = new Set();
  for (const word of searchName.split(' ').filter(Boolean)) {
    for (let length = 1; length <= Math.min(word.length, 128); length += 1) {
      terms.add(word.slice(0, length));
    }
  }

  return {
    searchName,
    searchText: [...terms].sort().map(searchToken).join(' '),
    searchIndexVersion: SEARCH_INDEX_VERSION,
    syncStage: 'full',
    zethoVersion: 2,
  };
}

function demoGameData(data) {
  return { ...data, ...buildSearchMetadata(data.name), searchAliases: [] };
}

// These records are fictional and use reserved negative external references so
// they cannot collide with the positive IDs used by IGDB imports.
const DEMO_ROWS = [
  {
    tableId: 'game_types',
    rowId: 'demo-adventure',
    data: { type: 'Demo Adventure' },
  },
  {
    tableId: 'games',
    rowId: 'demo-game-starlit-archive',
    data: demoGameData({
      name: 'The Starlit Archive',
      slug: 'demo-the-starlit-archive',
      externalReference: -2000001,
      gameType: 'demo-adventure',
      releaseYear: '2025',
      summary:
        'A quiet cartographer maps a library that appears only under a meteor shower.',
      ratingAvg: 0,
      ratingCount: 0,
      ratingSum: 0,
      hypes: 0,
      genres: [],
    }),
  },
  {
    tableId: 'z_entry_count',
    rowId: 'zstats_demo-game-starlit-archive',
    data: { game: 'demo-game-starlit-archive' },
  },
  {
    tableId: 'games',
    rowId: 'demo-game-lanterns-low-tide',
    data: demoGameData({
      name: 'Lanterns at Low Tide',
      slug: 'demo-lanterns-at-low-tide',
      externalReference: -2000002,
      gameType: 'demo-adventure',
      releaseYear: '2024',
      summary:
        'Explore a drowned coastal town and restore its lighthouse one memory at a time.',
      ratingAvg: 0,
      ratingCount: 0,
      ratingSum: 0,
      hypes: 0,
      genres: [],
    }),
  },
  {
    tableId: 'z_entry_count',
    rowId: 'zstats_demo-game-lanterns-low-tide',
    data: { game: 'demo-game-lanterns-low-tide' },
  },
  {
    tableId: 'games',
    rowId: 'demo-game-clockwork-orchard',
    data: demoGameData({
      name: 'The Clockwork Orchard',
      slug: 'demo-the-clockwork-orchard',
      externalReference: -2000003,
      gameType: 'demo-adventure',
      releaseYear: '2026',
      summary:
        'Tend a mechanical garden where every growing season changes the shape of time.',
      ratingAvg: 0,
      ratingCount: 0,
      ratingSum: 0,
      hypes: 0,
      genres: [],
    }),
  },
  {
    tableId: 'z_entry_count',
    rowId: 'zstats_demo-game-clockwork-orchard',
    data: { game: 'demo-game-clockwork-orchard' },
  },
];

function parseArgs(args) {
  let mode;
  const options = { allowRemote: false };
  for (const arg of args) {
    if (arg === '--dry-run') {
      if (mode === 'apply') {
        throw new Error('Choose either --dry-run or --apply');
      }
      mode = 'dry-run';
    } else if (arg === '--apply') {
      if (mode === 'dry-run') {
        throw new Error('Choose either --dry-run or --apply');
      }
      mode = 'apply';
    } else if (arg === '--allow-remote') {
      options.allowRemote = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { ...options, apply: mode === 'apply' };
}

function requiredEnv(name, value) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return normalized;
}

function getTarget(env, allowRemote) {
  const endpoint = requiredEnv('APPWRITE_ENDPOINT', env.APPWRITE_ENDPOINT);
  const projectId = requiredEnv('APPWRITE_PROJECT', env.APPWRITE_PROJECT);
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('APPWRITE_ENDPOINT must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APPWRITE_ENDPOINT must use http or https');
  }
  if (url.username || url.password) {
    throw new Error(
      'APPWRITE_ENDPOINT must not include a username or password',
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (!isLocalhost && !allowRemote) {
    throw new Error(
      'Refusing a non-local Appwrite endpoint; pass --allow-remote to explicitly allow it',
    );
  }

  return { endpoint: url.toString().replace(/\/$/, ''), projectId };
}

function isNotFound(error) {
  return error?.code === 404;
}

async function seedCatalog(tablesDB, { dryRun = true, log = () => {} } = {}) {
  const result = { planned: 0, created: 0, alreadyExists: 0 };

  for (const row of DEMO_ROWS) {
    if (dryRun) {
      result.planned += 1;
      const label =
        row.data.name ??
        row.data.type ??
        (row.data.game ? `stats for ${row.data.game}` : 'demo row');
      log(`Would create ${row.tableId}/${row.rowId}: ${label}`);
      continue;
    }

    try {
      await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: row.tableId,
        rowId: row.rowId,
      });
      result.alreadyExists += 1;
      log(`Already exists; leaving unchanged: ${row.tableId}/${row.rowId}`);
    } catch (error) {
      if (!isNotFound(error)) throw error;

      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: row.tableId,
        rowId: row.rowId,
        data: row.data,
        permissions: PUBLIC_READ,
      });
      result.created += 1;
      log(`Created ${row.tableId}/${row.rowId}`);
    }
  }

  return result;
}

async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args);
  require('dotenv').config({ path: path.join(API_ROOT, '.env'), quiet: true });

  const target = getTarget(env, options.allowRemote);
  console.log(
    `Appwrite target: ${target.endpoint} (project ${target.projectId})`,
  );

  if (!options.apply) {
    const result = await seedCatalog(null, {
      dryRun: true,
      log: (message) => console.log(message),
    });
    console.log(
      `Dry run complete: ${result.planned} demo rows would be created.`,
    );
    console.log(
      'Pass --apply to create missing rows. Existing rows are never updated.',
    );
    return result;
  }

  const apiKey = requiredEnv('APPWRITE_API_KEY', env.APPWRITE_API_KEY);
  const { Client, TablesDB } = require('node-appwrite');
  const client = new Client()
    .setEndpoint(target.endpoint)
    .setProject(target.projectId)
    .setKey(apiKey);
  const result = await seedCatalog(new TablesDB(client), {
    dryRun: false,
    log: (message) => console.log(message),
  });
  console.log(
    `Seed complete: ${result.created} created, ${result.alreadyExists} already present.`,
  );
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEMO_ROWS,
  getTarget,
  main,
  parseArgs,
  seedCatalog,
};
