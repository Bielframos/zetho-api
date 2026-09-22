import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';

// Table permissions must be revoked separately through appwrite.config.json.
// --apply changes existing rows; the default prints the proposed changes.
const tables = [
  'user_profiles',
  'z_entries',
  'z_entries_read',
  'zcoin_transactions',
  'game_comment_votes',
  'lists',
  'list_items',
  'connections',
];
const writePermission = /^(create|update|delete|write)\(/;

async function main() {
  const apply = process.argv.includes('--apply');
  const db = new Appwrite().tablesDB;
  for (const tableId of tables) {
    let cursor: string | undefined;
    let changed = 0;
    for (;;) {
      const page = await db.listRows({
        databaseId: 'app',
        tableId,
        queries: [
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      for (const row of page.rows) {
        const permissions = row.$permissions.filter(
          (permission) => !writePermission.test(permission),
        );
        if (permissions.length === row.$permissions.length) continue;
        changed++;
        console.log(`${tableId}/${row.$id}: ${row.$permissions.join(', ')} => ${permissions.join(', ')}`);
        if (apply) {
          await db.updateRow({
            databaseId: 'app',
            tableId,
            rowId: row.$id,
            permissions,
          });
        }
      }
      if (page.rows.length < 100) break;
      cursor = page.rows.at(-1)?.$id;
    }
    console.log(`${tableId}: ${changed} rows ${apply ? 'changed' : 'would change'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
