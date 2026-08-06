import 'dotenv/config';
import { Client, Models, Query, TablesDB } from 'node-appwrite';

/**
 * `likeCount`/`commentCount` foram criadas em `z_entries` quando a tabela já
 * tinha registros, e o `default` do Appwrite só vale na criação da row: as
 * linhas anteriores ficaram com `null`. Como increment/decrement sobre `null` é
 * um no-op silencioso, o contador nunca saía do lugar. Este script recalcula os
 * totais reais a partir de `z_entry_likes` e `z_entry_comments` (e o
 * `replyCount` das respostas) e grava o valor absoluto.
 *
 * Uso: `pnpm social:backfill-entry-counters` (dry run) e depois `--apply`.
 */

type EntryRow = Models.Row & {
  likeCount?: number | null;
  commentCount?: number | null;
};

type LikeRow = Models.Row & { entryId?: string };
type CommentRow = Models.Row & {
  entryId?: string;
  parentId?: string | null;
  replyCount?: number | null;
};

const apply = process.argv.includes('--apply');
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT ?? '')
  .setProject(process.env.APPWRITE_PROJECT ?? '')
  .setKey(process.env.APPWRITE_API_KEY ?? '');
const tablesDB = new TablesDB(client);
const databaseId = 'app';
const PAGE_SIZE = 100;
const WRITE_CONCURRENCY = 5;
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A instância do Appwrite derruba conexões sob carga; retentar resolve. */
async function withRetry<T>(label: string, operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${label} falhou após ${MAX_ATTEMPTS} tentativas`, {
    cause: lastError,
  });
}

async function listAllRows<T extends Models.Row>(tableId: string) {
  const rows: T[] = [];
  let cursor: string | undefined;
  while (true) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderAsc('$id')];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withRetry(`listRows ${tableId}`, () =>
      tablesDB.listRows<T>({ databaseId, tableId, queries }),
    );
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return rows;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

type PendingUpdate = {
  tableId: string;
  rowId: string;
  data: Record<string, number>;
  before: Record<string, unknown>;
};

async function runUpdates(updates: PendingUpdate[]) {
  let done = 0;
  const failures: Array<{ rowId: string; error: unknown }> = [];

  for (let i = 0; i < updates.length; i += WRITE_CONCURRENCY) {
    const batch = updates.slice(i, i + WRITE_CONCURRENCY);
    await Promise.all(
      batch.map(async (update) => {
        try {
          await withRetry(`updateRow ${update.rowId}`, () =>
            tablesDB.updateRow({
              databaseId,
              tableId: update.tableId,
              rowId: update.rowId,
              data: update.data,
            }),
          );
        } catch (error) {
          failures.push({ rowId: update.rowId, error });
        }
      }),
    );
    done += batch.length;
    if (done % 500 === 0 || done === updates.length) {
      console.log(`  ${done}/${updates.length} linhas processadas`);
    }
  }

  return failures;
}

async function main() {
  console.log('Lendo tabelas...');
  const [entries, likes, comments] = await Promise.all([
    listAllRows<EntryRow>('z_entries'),
    listAllRows<LikeRow>('z_entry_likes'),
    listAllRows<CommentRow>('z_entry_comments'),
  ]);
  console.log(
    `z_entries: ${entries.length} | z_entry_likes: ${likes.length} | z_entry_comments: ${comments.length}`,
  );

  const likesByEntry = countBy(likes, (row) => row.entryId);
  const commentsByEntry = countBy(comments, (row) => row.entryId);
  const repliesByParent = countBy(comments, (row) => row.parentId);

  const updates: PendingUpdate[] = [];
  let nullCounters = 0;
  let divergentCounters = 0;

  for (const entry of entries) {
    const expectedLikes = likesByEntry.get(entry.$id) ?? 0;
    const expectedComments = commentsByEntry.get(entry.$id) ?? 0;
    const data: Record<string, number> = {};

    if (entry.likeCount !== expectedLikes) {
      data.likeCount = expectedLikes;
      if (entry.likeCount === null || entry.likeCount === undefined)
        nullCounters += 1;
      else divergentCounters += 1;
    }
    if (entry.commentCount !== expectedComments) {
      data.commentCount = expectedComments;
      if (entry.commentCount === null || entry.commentCount === undefined)
        nullCounters += 1;
      else divergentCounters += 1;
    }

    if (Object.keys(data).length > 0) {
      updates.push({
        tableId: 'z_entries',
        rowId: entry.$id,
        data,
        before: {
          likeCount: entry.likeCount,
          commentCount: entry.commentCount,
        },
      });
    }
  }

  for (const comment of comments) {
    const expectedReplies = repliesByParent.get(comment.$id) ?? 0;
    if (comment.replyCount === expectedReplies) continue;
    if (comment.replyCount === null || comment.replyCount === undefined)
      nullCounters += 1;
    else divergentCounters += 1;
    updates.push({
      tableId: 'z_entry_comments',
      rowId: comment.$id,
      data: { replyCount: expectedReplies },
      before: { replyCount: comment.replyCount },
    });
  }

  console.log(
    `\n${updates.length} linhas a corrigir (${nullCounters} contadores nulos, ${divergentCounters} divergentes).`,
  );

  const sample = updates.filter((update) =>
    Object.values(update.data).some((value) => value > 0),
  );
  for (const update of sample.slice(0, 10)) {
    console.log(
      `  ${update.tableId}/${update.rowId}: ${JSON.stringify(update.before)} -> ${JSON.stringify(update.data)}`,
    );
  }
  if (sample.length > 10) {
    console.log(`  ... e mais ${sample.length - 10} linhas com valor > 0`);
  }

  if (!apply) {
    console.log('\nDry run: nada foi gravado. Rode novamente com --apply.');
    return;
  }
  if (updates.length === 0) {
    console.log('\nNada a fazer.');
    return;
  }

  console.log('\nAplicando...');
  const failures = await runUpdates(updates);
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} linhas não foram atualizadas. O script é idempotente: rode novamente com --apply.`,
    );
    console.error(failures[0].error);
    process.exitCode = 1;
    return;
  }
  console.log('Backfill concluído.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
