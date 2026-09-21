import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { AchievementsService } from '../src/modules/achievements/achievements.service';
import { TransactionService } from '../src/infra/appwrite/transaction.service';

// Run after deploying schema. Use --after=<profileId> to resume after interruption.
async function main() {
  const appwrite = new Appwrite();
  const service = new AchievementsService(
    appwrite,
    new TransactionService(appwrite),
    {} as any,
  );
  const db = appwrite.tablesDB;
  let cursor = process.argv.find((x) => x.startsWith('--after='))?.slice(8);
  for (;;) {
    const profiles = await db.listRows<any>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [
        Query.orderAsc('$id'),
        Query.limit(50),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    for (const profile of profiles.rows) {
      let entryCursor: string | undefined;
      const previousStatus = new Map<string, string | null>();
      for (;;) {
        const entries = await db.listRows<any>({
          databaseId: 'app',
          tableId: 'z_entries',
          queries: [
            Query.equal('ownerFingerprint', profile.fingerprint),
            Query.orderAsc('$createdAt'),
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(entryCursor ? [Query.cursorAfter(entryCursor)] : []),
          ],
        });
        for (const entry of entries.rows) {
          const before = previousStatus.get(entry.gameId) ?? null;
          if (entry.status === 'completed' && before !== 'completed') {
            await service.recordCompletion(
              profile.$id,
              entry.gameId,
              entry.$createdAt,
            );
          }
          previousStatus.set(entry.gameId, entry.status ?? null);
        }
        if (entries.rows.length < 100) break;
        entryCursor = entries.rows.at(-1).$id;
      }
      await service.reconcile(profile.$id);
      cursor = profile.$id;
      console.log(`completed profile ${cursor}`);
    }
    if (profiles.rows.length < 50) break;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
