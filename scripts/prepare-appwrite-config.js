#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = path.resolve(__dirname, '..');
const SOURCE_CONFIG_PATH = path.join(API_ROOT, 'appwrite.config.json');
const OUTPUT_CONFIG_PATH = path.join(API_ROOT, 'appwrite.local.json');

function requiredEnv(name, value) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return normalized;
}

function createLocalConfig(source, env) {
  const teams = Array.isArray(source.teams) ? source.teams : [];

  return {
    projectId: requiredEnv('APPWRITE_PROJECT', env.APPWRITE_PROJECT),
    endpoint: requiredEnv('APPWRITE_ENDPOINT', env.APPWRITE_ENDPOINT),
    tablesDB: source.tablesDB ?? [],
    tables: source.tables ?? [],
    buckets: source.buckets ?? [],
    // Team definitions are schema dependencies. Memberships and live team
    // metadata belong to the destination project and are never copied here.
    teams: teams.map(({ $id, name }) => ({ $id, name })),
  };
}

function main() {
  require('dotenv').config({ path: path.join(API_ROOT, '.env') });

  try {
    const source = JSON.parse(fs.readFileSync(SOURCE_CONFIG_PATH, 'utf8'));
    const config = createLocalConfig(source, process.env);
    fs.writeFileSync(
      OUTPUT_CONFIG_PATH,
      `${JSON.stringify(config, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    console.log(`Wrote ${path.relative(API_ROOT, OUTPUT_CONFIG_PATH)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { createLocalConfig };
