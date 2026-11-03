import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { TransactionService } from '../src/infra/appwrite/transaction.service';

export type FounderAccount = {
  $id: string;
  $createdAt: string;
  emailVerification: boolean;
  status: boolean;
};
type Allocation = {
  $id: string;
  $updatedAt?: string;
  userId: string;
  number: number;
  accountCreatedAt: string;
};

export function buildVerifiedFounderPlan(
  accounts: FounderAccount[],
  zeroUserId: string,
) {
  const eligible = accounts.filter(
    (user) => user.emailVerification && user.status,
  );
  const zero = eligible.find((user) => user.$id === zeroUserId);
  if (!zero)
    throw new Error(
      'A conta #0000 precisa estar ativa e com e-mail confirmado',
    );
  const others = eligible
    .filter((user) => user.$id !== zeroUserId)
    .sort(
      (a, b) =>
        a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id),
    );
  return [zero, ...others.slice(0, 1000)].map((user, number) => ({
    userId: user.$id,
    number,
    accountCreatedAt: user.$createdAt,
  }));
}

export function founderChanges(
  allocations: Allocation[],
  plan: ReturnType<typeof buildVerifiedFounderPlan>,
) {
  const unchanged = new Set(
    plan
      .filter((target) =>
        allocations.some(
          (row) =>
            row.$id === target.userId &&
            row.userId === target.userId &&
            row.number === target.number &&
            row.accountCreatedAt === target.accountCreatedAt,
        ),
      )
      .map((row) => row.userId),
  );
  return {
    remove: allocations.filter((row) => !unchanged.has(row.userId)),
    create: plan.filter((row) => !unchanged.has(row.userId)),
  };
}

export async function applyFounderRecalculation(
  app: Appwrite,
  tx: TransactionService,
  state: {
    $id: string;
    $updatedAt: string;
    zeroUserId: string;
    nextNumber: number;
  },
  allocations: Allocation[],
  plan: ReturnType<typeof buildVerifiedFounderPlan>,
  maxOperations = 100,
) {
  const { remove, create } = founderChanges(allocations, plan);
  if (
    !plan.length ||
    plan[0].number !== 0 ||
    plan[0].userId !== state.zeroUserId
  )
    throw new Error('Plano inválido para #0000');
  if (remove.length + create.length + 1 > maxOperations)
    throw new Error(
      'Plano excede o limite transacional. Confira o limite da instalação e use --max-operations=<limite> antes de aplicar.',
    );
  for (const target of plan) {
    const user = await app.users.get({ userId: target.userId });
    if (
      !user.emailVerification ||
      !user.status ||
      user.$createdAt !== target.accountCreatedAt
    )
      throw new Error('Elegibilidade mudou; execute a prévia novamente');
  }
  await tx.runInTransaction(async ({ txId }) => {
    const db = app.tablesDB;
    const current = await db.getRow<any>({
      databaseId: 'app',
      tableId: 'founder_state',
      rowId: state.$id,
      transactionId: txId,
    });
    if (
      current.$updatedAt !== state.$updatedAt ||
      current.nextNumber !== state.nextNumber ||
      current.zeroUserId !== state.zeroUserId
    )
      throw new Error('Checkpoint mudou; execute a prévia novamente');
    // Lock the same checkpoint as every allocator. A concurrent allocation causes
    // the entire recalculation to roll back, including all number changes.
    await db.updateRow({
      databaseId: 'app',
      tableId: 'founder_state',
      rowId: state.$id,
      data: {
        nextNumber: plan.length,
        afterCreatedAt: null,
        afterUserId: null,
      },
      transactionId: txId,
    });
    for (const previous of allocations) {
      const row = await db.getRow<any>({
        databaseId: 'app',
        tableId: 'founder_allocations',
        rowId: previous.$id,
        transactionId: txId,
      });
      if (
        row.$updatedAt !== previous.$updatedAt ||
        row.userId !== previous.userId ||
        row.number !== previous.number
      )
        throw new Error('Uma atribuição mudou; execute a prévia novamente');
    }
    // Remove all changed numbers before recreating them to preserve unique indexes.
    for (const row of remove)
      await db.deleteRow({
        databaseId: 'app',
        tableId: 'founder_allocations',
        rowId: row.$id,
        transactionId: txId,
      });
    for (const row of create)
      await db.createRow({
        databaseId: 'app',
        tableId: 'founder_allocations',
        rowId: row.userId,
        data: row,
        transactionId: txId,
      });
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const maxOperations = Number(
    process.argv
      .find((arg) => arg.startsWith('--max-operations='))
      ?.split('=')[1] ?? 100,
  );
  if (
    !Number.isInteger(maxOperations) ||
    maxOperations < 1 ||
    maxOperations > 2500
  )
    throw new Error(
      '--max-operations precisa ser um inteiro entre 1 e 2500, compatível com sua instalação',
    );
  const app = new Appwrite();
  const state = await app.tablesDB.getRow<any>({
    databaseId: 'app',
    tableId: 'founder_state',
    rowId: 'edition-v1',
  });
  const zero = await app.users.get({ userId: state.zeroUserId });
  const accounts: FounderAccount[] = [zero];
  let cursor: string | undefined;
  while (accounts.length < 1001) {
    const page = await app.users.list({
      queries: [
        Query.equal('emailVerification', true),
        Query.equal('status', true),
        Query.orderAsc('$createdAt'),
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    accounts.push(
      ...page.users.filter((user) => user.$id !== state.zeroUserId),
    );
    if (page.users.length < 100) break;
    cursor = page.users.at(-1)!.$id;
  }
  const allocations: Allocation[] = [];
  cursor = undefined;
  for (;;) {
    const page = await app.tablesDB.listRows<any>({
      databaseId: 'app',
      tableId: 'founder_allocations',
      queries: [
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    allocations.push(...page.rows);
    if (page.rows.length < 100) break;
    cursor = page.rows.at(-1)!.$id;
  }
  const plan = buildVerifiedFounderPlan(accounts, state.zeroUserId);
  const changes = founderChanges(allocations, plan);
  const plannedIds = new Set(plan.map((row) => row.userId));
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'preview',
      before: allocations.length,
      after: plan.length,
      released: allocations.filter((row) => !plannedIds.has(row.userId)).length,
      renumbered: plan.filter((row) =>
        allocations.some(
          (old) => old.userId === row.userId && old.number !== row.number,
        ),
      ).length,
      newlyAwarded: plan.filter(
        (row) => !allocations.some((old) => old.userId === row.userId),
      ).length,
      nextNumber: plan.length,
      operations: changes.remove.length + changes.create.length + 1,
      maxOperations,
    }),
  );
  if (!apply) return;
  const zeroId = process.argv
    .find((arg) => arg.startsWith('--zero-user-id='))
    ?.split('=')[1];
  if (zeroId !== state.zeroUserId)
    throw new Error(
      'Confirme #0000 com --zero-user-id=<ID da conta configurada na edição>',
    );
  await applyFounderRecalculation(
    app,
    new TransactionService(app),
    state,
    allocations,
    plan,
    maxOperations,
  );
  console.log(
    'Recálculo concluído em uma transação. Nenhuma conta ou perfil foi excluído. Aguarde até 60 segundos para os caches atualizarem.',
  );
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
