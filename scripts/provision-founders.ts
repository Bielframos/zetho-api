import 'dotenv/config';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import config from '../appwrite.config.json';

// Additive, rerunnable provisioner. No data writes unless --apply is supplied.
async function main() {
  const db = new Appwrite().tablesDB;
  const apply = process.argv.includes('--apply');
  for (const table of config.tables.filter((t) =>
    [
      'founder_state',
      'founder_allocations',
      'profile_sharing_consents',
      'profile_sharing_consent_events',
    ].includes(t.$id),
  )) {
    console.log(`${apply ? 'Provision' : 'Plan'}: ${table.$id} (server-only)`);
    if (!apply) continue;
    const ensure = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        if (error.code !== 409) throw error;
      }
    };
    await ensure(() =>
      db.createTable({
        databaseId: 'app',
        tableId: table.$id,
        name: table.name,
        permissions: [],
        rowSecurity: true,
      }),
    );
    const existing = await db.getTable({
      databaseId: 'app',
      tableId: table.$id,
    });
    if (existing.$permissions.length || !existing.rowSecurity)
      throw new Error(`Unsafe permissions: ${table.$id}`);
    for (const column of table.columns as any[]) {
      const params = {
        databaseId: 'app',
        tableId: table.$id,
        key: column.key,
        required: column.required,
      };
      await ensure(() =>
        column.type === 'string'
          ? db.createStringColumn({ ...params, size: column.size })
          : column.type === 'integer'
            ? db.createIntegerColumn({
                ...params,
                min: column.min,
                max: column.max,
              })
            : column.type === 'boolean'
              ? db.createBooleanColumn(params)
              : db.createDatetimeColumn(params),
      );
      // Appwrite provisions columns asynchronously; don't create indexes before readiness.
      for (let attempt = 0; ; attempt++) {
        const current = await db.getColumn({
          databaseId: 'app',
          tableId: table.$id,
          key: column.key,
        });
        if (current.status === 'available') {
          if (
            current.type !== column.type ||
            current.required !== column.required ||
            current.array
          )
            throw new Error(`Schema mismatch: ${table.$id}.${column.key}`);
          break;
        }
        if (current.status === 'failed' || attempt >= 60)
          throw new Error(`Column not ready: ${column.key}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    for (const index of table.indexes) {
      await ensure(() =>
        db.createIndex({
          databaseId: 'app',
          tableId: table.$id,
          key: index.key,
          type: index.type as any,
          columns: index.columns,
          orders: index.orders as any,
        }),
      );
      for (let attempt = 0; ; attempt++) {
        const current = await db.getIndex({
          databaseId: 'app',
          tableId: table.$id,
          key: index.key,
        });
        if (current.status === 'available') {
          if (
            current.type !== index.type ||
            JSON.stringify(current.columns) !== JSON.stringify(index.columns)
          )
            throw new Error(`Index mismatch: ${index.key}`);
          break;
        }
        if (current.status === 'failed' || attempt >= 60)
          throw new Error(`Index not ready: ${index.key}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
