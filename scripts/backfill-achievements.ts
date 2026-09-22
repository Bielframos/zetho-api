import 'dotenv/config';
import { Query } from 'node-appwrite';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { AchievementsService } from '../src/modules/achievements/achievements.service';
import { TransactionService } from '../src/infra/appwrite/transaction.service';
import { JSDOM } from 'jsdom';

const apply = process.argv.includes('--apply');

async function listAll(
  db: Appwrite['tablesDB'],
  tableId: string,
  filters: string[],
) {
  const rows: any[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.listRows<any>({
      databaseId: 'app',
      tableId,
      queries: [
        ...filters,
        Query.orderAsc('$id'),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    rows.push(...page.rows);
    if (page.rows.length < 100) return rows;
    cursor = page.rows.at(-1).$id;
  }
}

function visibleReviewLength(content: unknown) {
  if (typeof content !== 'string') return 0;
  const fragment = JSDOM.fragment(content);
  fragment
    .querySelectorAll('script, style, template')
    .forEach((node) => node.remove());
  return (fragment.textContent ?? '').replace(/\u00a0/g, ' ').trim().length;
}

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
  let profileCount = 0;
  const completionIds = new Set<string>();
  const candidates = { soulslike_3: 0, reviews_5: 0, sessions_3: 0 };
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
      profileCount++;
      let entryCursor: string | undefined;
      const previousStatus = new Map<string, string | null>();
      const completedGames = new Set<string>();
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
            const year = new Date(entry.$createdAt).getUTCFullYear();
            const key = `${profile.$id}:${year}:${entry.gameId}`;
            completionIds.add(key);
            completedGames.add(entry.gameId);
            if (apply)
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
      if (apply) {
        await service.reconcile(profile.$id);
      } else {
        let soulslike = 0;
        const ids = [...completedGames];
        for (let i = 0; i < ids.length; i += 100) {
          const games = await db.listRows<any>({
            databaseId: 'app',
            tableId: 'games',
            queries: [
              Query.equal('$id', ids.slice(i, i + 100)),
              Query.limit(100),
            ],
          });
          soulslike += games.rows.filter((game) =>
            (game.subgenres ?? []).includes('soulslike'),
          ).length;
        }
        if (soulslike >= 3) candidates.soulslike_3++;
        const ratings = await listAll(db, 'ratings', [
          Query.equal('ownerFingerprint', profile.fingerprint),
        ]);
        if (
          ratings.filter((row) => visibleReviewLength(row.content) > 300)
            .length >= 5
        )
          candidates.reviews_5++;
        const sessions = await listAll(db, 'gameplay_sessions', [
          Query.equal('hostProfileId', profile.$id),
          Query.equal('status', 'completed'),
        ]);
        if (sessions.length >= 3) candidates.sessions_3++;
      }
      cursor = profile.$id;
      if (apply) console.log(`completed profile ${cursor}`);
    }
    if (profiles.rows.length < 50) break;
  }
  console.log(
    `${apply ? 'Applied' : 'Dry run'}: ${profileCount} profiles, ${completionIds.size} unique completion events`,
  );
  if (!apply)
    console.log(
      `Badge candidates: ${JSON.stringify(candidates)}. Nothing written; pass --apply to write.`,
    );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
