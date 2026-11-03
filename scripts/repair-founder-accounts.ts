import 'dotenv/config';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { TransactionService } from '../src/infra/appwrite/transaction.service';
import {
  buildVerifiedFounderPlan,
  type FounderAccount,
} from './recalculate-founders';

export function buildFounderRepairPlan(
  accounts: FounderAccount[],
  zeroUserId: string,
  removedIds: string[],
) {
  if (removedIds.includes(zeroUserId))
    throw new Error('A conta #0000 não pode ser removida por esta operação');
  return buildVerifiedFounderPlan(
    accounts.filter((user) => !removedIds.includes(user.$id)),
    zeroUserId,
  );
}

async function main() {
  const removedIds = [
    ...new Set(
      process.argv
        .filter((arg) => arg.startsWith('--remove-user-id='))
        .map((arg) => arg.slice(17)),
    ),
  ];
  if (
    !removedIds.length ||
    removedIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,35}$/.test(id))
  )
    throw new Error('Informe --remove-user-id=<ID> para cada conta a remover');
  const apply = process.argv.includes('--apply');
  const app = new Appwrite();
  const db = app.tablesDB;
  const tx = new TransactionService(app);
  const state = await db.getRow<any>({
    databaseId: 'app',
    tableId: 'founder_state',
    rowId: 'edition-v1',
  });
  if (removedIds.includes(state.zeroUserId))
    throw new Error('Não é permitido excluir #0000');
  const allRows = async (tableId: string, queries: string[] = []) => {
    const rows: any[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await db.listRows<any>({
        databaseId: 'app',
        tableId,
        queries: [
          ...queries,
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      rows.push(...page.rows);
      if (page.rows.length < 100) return rows;
      cursor = page.rows.at(-1).$id;
    }
  };
  const accounts: Models.User[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await app.users.list({
      queries: [
        Query.orderAsc('$createdAt'),
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    accounts.push(...page.users);
    if (page.users.length < 100) break;
    cursor = page.users.at(-1)!.$id;
  }
  const [profiles, allocations] = await Promise.all([
    allRows('user_profiles', [Query.equal('userId', removedIds)]),
    allRows('founder_allocations'),
  ]);
  const plan = buildFounderRepairPlan(accounts, state.zeroUserId, removedIds);
  const oldByUser = new Map(allocations.map((row) => [row.userId, row]));
  const plannedIds = new Set(plan.map((row) => row.userId));
  const removedAllocations = allocations.filter(
    (row) => !plannedIds.has(row.userId),
  );
  const changedAllocations = plan.filter(
    (row) => oldByUser.get(row.userId)?.number !== row.number,
  );
  // Bound the exact number of profile deletes, reservation deletes/writes and checkpoint writes.
  if (
    profiles.length +
      removedAllocations.length +
      changedAllocations.length +
      1 >
    95
  )
    throw new Error(
      'Correção excede o limite seguro de operações; requer migração em lotes específica',
    );
  for (const row of plan) {
    const previous = oldByUser.get(row.userId);
    if (previous && previous.number < row.number)
      throw new Error(
        'A correção aumentaria um número existente; revise o plano',
      );
  }
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'preview',
      accountsToDelete: accounts.filter((user) => removedIds.includes(user.$id))
        .length,
      profilesToDelete: profiles.length,
      reservationsBefore: allocations.length,
      reservationsAfter: plan.length,
      renumbered: plan.filter(
        (row) => oldByUser.get(row.userId)?.number !== row.number,
      ).length,
    }),
  );
  if (!apply) return;

  // Pause automatic allocations before deleting identities. A failed run stays paused
  // and can safely be rerun with the same IDs; 404 is accepted only for exact targets.
  await tx.runInTransaction(async ({ txId }) => {
    const current = await db.getRow<any>({
      databaseId: 'app',
      tableId: 'founder_state',
      rowId: state.$id,
      transactionId: txId,
    });
    if (current.$updatedAt !== state.$updatedAt)
      throw new Error('Checkpoint mudou. Execute a prévia novamente.');
    await db.updateRow({
      databaseId: 'app',
      tableId: 'founder_state',
      rowId: state.$id,
      data: { nextNumber: 1001 },
      transactionId: txId,
    });
  });
  for (const userId of removedIds) {
    try {
      await app.users.delete({ userId });
    } catch (error) {
      if (error.code !== 404) throw error;
    }
  }
  await tx.runInTransaction(async ({ txId }) => {
    for (const profile of profiles)
      await db.deleteRow({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: profile.$id,
        transactionId: txId,
      });
    for (const row of removedAllocations)
      await db.deleteRow({
        databaseId: 'app',
        tableId: 'founder_allocations',
        rowId: row.$id,
        transactionId: txId,
      });
    // Delete the removed reservations first, then move survivors in ascending order.
    // Every destination is a gap freed by the preceding operation, preserving uniqueness.
    for (const row of plan) {
      const previous = oldByUser.get(row.userId);
      if (previous && previous.number === row.number) continue;
      const params = {
        databaseId: 'app',
        tableId: 'founder_allocations',
        rowId: previous?.$id ?? row.userId,
        data: row,
        transactionId: txId,
      };
      if (previous) await db.updateRow(params);
      else await db.createRow(params);
    }
    const last = [...accounts]
      .filter((user) => !removedIds.includes(user.$id))
      .sort(
        (a, b) =>
          a.$createdAt.localeCompare(b.$createdAt) ||
          a.$id.localeCompare(b.$id),
      )
      .at(-1)!;
    await db.updateRow({
      databaseId: 'app',
      tableId: 'founder_state',
      rowId: state.$id,
      data: {
        nextNumber: plan.length,
        afterCreatedAt: last.$createdAt,
        afterUserId: last.$id,
      },
      transactionId: txId,
    });
  });
  const remainingProfiles = await allRows('user_profiles', [
    Query.equal('userId', removedIds),
  ]);
  const final = await allRows('founder_allocations');
  if (
    remainingProfiles.length ||
    final.length !== plan.length ||
    plan.some(
      (row) =>
        !final.some(
          (current) =>
            current.userId === row.userId && current.number === row.number,
        ),
    )
  )
    throw new Error('Verificação final falhou');
  for (const userId of removedIds) {
    try {
      await app.users.get({ userId });
      throw new Error('Conta ainda existe');
    } catch (error) {
      if (error.code !== 404) throw error;
    }
  }
  console.log(
    `Contas e perfis excluídos. ${final.length} reservas verificadas, sem lacunas. Próximo número: #${String(plan.length).padStart(4, '0')}.`,
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
