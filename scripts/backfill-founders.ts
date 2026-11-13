import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { TransactionService } from '../src/infra/appwrite/transaction.service';
import {
  FoundersService,
  FOUNDER_LAST_NUMBER,
} from '../src/modules/achievements/founders.service';

async function main() {
  const app = new Appwrite();
  const apply = process.argv.includes('--apply');
  const zeroUserId = process.argv
    .find((arg) => arg.startsWith('--zero-user-id='))
    ?.split('=')[1];
  const profiles = await app.tablesDB.listRows<any>({
    databaseId: 'app',
    tableId: 'user_profiles',
    queries: [Query.equal('gamertag', 'Zero'), Query.limit(2)],
  });
  if (profiles.rows.length !== 1)
    throw new Error('Não foi possível identificar unicamente o perfil Zero');
  const zero = profiles.rows[0];
  console.log(`Perfil Zero: ${zero.$id}; conta #0000: ${zero.userId}`);
  if (apply && zeroUserId !== zero.userId)
    throw new Error(
      'Confirme a identidade com --zero-user-id=<ID exibido na prévia>',
    );
  const service = new FoundersService(app, new TransactionService(app));
  if (apply) {
    await service.initialize(zeroUserId!);
    await service.sync();
    console.log(
      'Números atribuídos a contas confirmadas. Reexecuções preservam os números existentes.',
    );
    return;
  }
  console.log('Prévia inicial (não altera reservas já existentes):');
  let cursor: string | undefined;
  let number = 1;
  while (number <= FOUNDER_LAST_NUMBER) {
    const batch = await app.users.list({
      queries: [
        Query.equal('emailVerification', true),
        Query.equal('status', true),
        Query.orderAsc('$createdAt'),
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const user of batch.users) {
      if (user.$id === zero.userId) continue;
      if (number > FOUNDER_LAST_NUMBER) break;
      console.log(
        `#${String(number++).padStart(4, '0')} ${user.$id} ${user.$createdAt}`,
      );
    }
    if (batch.users.length < 100) break;
    cursor = batch.users.at(-1)!.$id;
  }
  console.log(
    'Nada gravado. Use --apply --zero-user-id=<ID> após provisionar e conferir a prévia.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
