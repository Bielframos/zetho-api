import { Module, OnModuleInit } from '@nestjs/common';
import { DashboardModule } from 'src/system/dashboard/dashboard.module';
import { WebhookModule } from '../webhook/webhook.module';
import { OutboxService } from 'src/infra/events/outbox.service';
import { TimelineService } from 'src/system/dashboard/timeline.service';
import { ZethoHandler } from '../webhook/handlers/zetho.handler';
import { Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
@Module({
  imports: [DashboardModule, WebhookModule],
  controllers: [SocialController, ForumController],
  providers: [SocialService, ForumService],
  exports: [SocialService, ForumService],
})
export class SocialModule implements OnModuleInit {
  constructor(
    private readonly outbox: OutboxService,
    private readonly timeline: TimelineService,
    private readonly zetho: ZethoHandler,
    private readonly appwrite: Appwrite,
  ) {}
  onModuleInit() {
    this.outbox.registerHandler(
      'SOCIAL_TIMELINE',
      async ({ table, row, action }) => {
        const source =
          action === 'delete'
            ? row
            : await this.appwrite.tablesDB
                .getRow<any>({
                  databaseId: 'app',
                  tableId: table,
                  rowId: row.$id,
                })
                .catch(() => null);
        if (source) await this.timeline.ingest(table, source, action);
      },
    );
    this.outbox.registerHandler('SOCIAL_ENTRY_SYNC', async ({ entryId }) => {
      const entry = await this.appwrite.tablesDB.getRow<any>({
        databaseId: 'app',
        tableId: 'z_entries',
        rowId: entryId,
      });
      if (entry.processedAt) return;
      const earlier = await this.appwrite.tablesDB.listRows<any>({
        databaseId: 'app',
        tableId: 'z_entries',
        queries: [
          Query.equal('ownerFingerprint', entry.ownerFingerprint),
          Query.equal('gameId', entry.gameId),
          Query.isNull('processedAt'),
          Query.orderAsc('$createdAt'),
          Query.orderAsc('$id'),
          Query.limit(1),
        ],
      });
      if (earlier.rows[0]?.$id !== entry.$id)
        throw new Error('Aguardando registro anterior do mesmo jogo');
      await this.zetho.syncEntry(entry);
    });
    this.outbox.registerHandler(
      'SOCIAL_COMMENT_REPLY',
      async ({ commentId }) => {
        const comment = await this.appwrite.tablesDB.getRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: commentId,
        });
        await this.zetho.handleCommentCreate(comment);
      },
    );
    this.outbox.registerHandler(
      'SOCIAL_LIST_ITEMS_DELETED',
      async ({ itemIds, actorProfileId }) => {
        for (const itemId of itemIds) {
          for (;;) {
            const page = await this.appwrite.tablesDB.listRows<any>({
              databaseId: 'app',
              tableId: 'feed_events',
              queries: [
                Query.equal('actorProfileId', actorProfileId),
                Query.equal('sourceType', 'list_item'),
                Query.equal('sourceId', itemId),
                Query.limit(100),
              ],
            });
            for (const row of page.rows) {
              await this.appwrite.tablesDB.deleteRow({
                databaseId: 'app',
                tableId: 'feed_events',
                rowId: row.$id,
              });
              await this.timeline.invalidate(row.recipientUserId);
            }
            if (page.rows.length < 100) break;
          }
        }
      },
    );
    this.outbox.registerHandler(
      'SOCIAL_CONNECTION',
      async ({ connection, action }) => {
        if (action === 'create')
          await this.timeline.backfillConnection(connection);
        else await this.timeline.invalidateConnection(connection);
      },
    );
  }
}
