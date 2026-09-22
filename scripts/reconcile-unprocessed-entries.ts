import 'dotenv/config';
import { ConflictException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Query } from 'node-appwrite';
import { AppwriteModule } from '../src/infra/appwrite/appwrite.module';
import { Appwrite } from '../src/infra/appwrite/appwrite.provider';
import { EventsModule } from '../src/infra/events/events.module';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { EmailTemplateService } from '../src/modules/notifications/email-template.service';
import { ZethoHandler } from '../src/modules/webhook/handlers/zetho.handler';
import type { ZEntries } from '../src/infra/appwrite/appwrite';

// Keep the repair process free of ScheduleModule so a dry run cannot start jobs.
@Module({
  imports: [AppwriteModule, EventsModule, ObservabilityModule],
  providers: [EmailTemplateService, ZethoHandler],
})
class EntryRepairModule {}

const entryKey = (entry: ZEntries) =>
  `${entry.ownerFingerprint}\u0000${entry.gameId}`;

const isLater = (left: ZEntries, right: ZEntries) =>
  left.$createdAt > right.$createdAt ||
  (left.$createdAt === right.$createdAt && left.$id > right.$id);

// Defaults to a count-only dry run. The API must be write-paused during --apply.
async function main() {
  const apply = process.argv.includes('--apply');
  const context = await NestFactory.createApplicationContext(EntryRepairModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = context.get(Appwrite).tablesDB;
    const handler = context.get(ZethoHandler);
    async function* entries() {
      let cursor: string | undefined;
      for (;;) {
        const page = await db.listRows<ZEntries>({
          databaseId: 'app',
          tableId: 'z_entries',
          queries: [
            Query.orderAsc('$createdAt'),
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        });
        for (const entry of page.rows) yield entry;
        if (page.rows.length < 100) break;
        cursor = page.rows.at(-1)?.$id;
      }
    }

    // A late replay of an older entry would regress the current read model.
    const latestProcessed = new Map<string, ZEntries>();
    for await (const entry of entries()) {
      if (!entry.processedAt) continue;
      const key = entryKey(entry);
      const latest = latestProcessed.get(key);
      if (!latest || isLater(entry, latest)) latestProcessed.set(key, entry);
    }

    let pending = 0;
    let unsafe = 0;
    for await (const entry of entries()) {
      if (entry.processedAt) continue;
      pending++;
      const later = latestProcessed.get(entryKey(entry));
      if (later && isLater(later, entry)) {
        unsafe++;
        console.error(
          `unsafe ${entry.$id}: owner/game already has newer processed entry ${later.$id}`,
        );
      }
    }
    console.log(`${pending} pending entries; ${unsafe} unsafe chronological replays`);
    if (unsafe) {
      // Fail before changing any row, including safe rows, so repair can be planned.
      process.exitCode = 2;
      return;
    }
    if (!apply) return;

    let processed = 0;
    for await (const entry of entries()) {
      if (entry.processedAt) continue;
      try {
        await handler.syncEntry(entry);
        processed++;
        console.log(`processed ${entry.$id}`);
      } catch (error) {
        // Another writer may have processed the same row since this page was read.
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    console.log(`${processed} entries processed`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
