#!/usr/bin/env node
/* Aditivo: cria user_profiles.favoriteGameIds. Sem --apply, só lê e mostra o plano. */
const config = require('../appwrite.config.json');
const apply = process.argv.includes('--apply');
const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT;
const apiKey = process.env.APPWRITE_API_KEY;
if (!endpoint || !project || !apiKey) throw Error('Defina APPWRITE_ENDPOINT, APPWRITE_PROJECT e APPWRITE_API_KEY');

const wanted = config.tables
  .find((t) => t.$id === 'user_profiles')
  .columns.find((c) => c.key === 'favoriteGameIds');
if (!wanted) throw Error('favoriteGameIds ausente do appwrite.config.json');

const base = '/tablesdb/app/tables/user_profiles/columns';
async function request(method, resource, body) {
  const res = await fetch(`${endpoint}${resource}`, {
    method,
    headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  console.log(`Instância: ${endpoint} (projeto ${project})`);
  const found = await request('GET', `${base}/${wanted.key}`);
  if (found.ok) {
    const c = found.json;
    const same = c.type === 'string' && c.array === true && c.size === wanted.size && !c.required;
    console.log(`Coluna já existe (status ${c.status}); ${same ? 'definição compatível, nada a fazer.' : 'DEFINIÇÃO DIFERENTE, não vou alterar.'}`);
    if (!same) process.exitCode = 1;
    return;
  }
  if (found.status !== 404) throw Error(`GET ${wanted.key}: ${found.status} ${found.json.message}`);
  console.log(`Plano: criar string[] ${wanted.key} (size ${wanted.size}, opcional) em user_profiles`);
  if (!apply) return console.log('Dry run: nada foi alterado. Use --apply para criar.');
  const created = await request('POST', `${base}/string`, { key: wanted.key, size: wanted.size, required: false, array: true, encrypt: false });
  if (!created.ok) throw Error(`POST: ${created.status} ${created.json.message}`);
  for (let i = 0; i < 60; i++) {
    const r = await request('GET', `${base}/${wanted.key}`);
    if (r.json.status === 'available') return console.log('Coluna criada e disponível.');
    if (['failed', 'stuck'].includes(r.json.status)) throw Error(`Coluna ${r.json.status}: ${r.json.error}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error('Tempo esgotado aguardando a coluna ficar disponível');
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
