import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { OutboxService } from 'src/infra/events/outbox.service';
import {
  DashboardProfilesService,
  type ProfileSummary,
} from './dashboard-profiles.service';

type CounterRow = Models.Row & Record<string, unknown>;

@Injectable()
export class DashboardEntrySocialService {
  private static readonly DB_ID = 'app';
  private static readonly FEED_STATUS_MILESTONES = [
    'completed',
    'backlog',
    'playing',
    'dropped',
  ];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly outbox: OutboxService,
    private readonly profiles: DashboardProfilesService,
  ) {}

  async toggleEntryLike(userId: string, entryId: string) {
    const [profile, entry] = await Promise.all([
      this.profiles.byUserId(userId),
      this.getEntryById(entryId),
    ]);
    this.assertFeedEntry(entry);

    const existing = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardEntrySocialService.DB_ID,
      tableId: 'z_entry_likes',
      queries: [
        Query.equal('entryId', entryId),
        Query.equal('userId', userId),
        Query.limit(1),
      ],
    });
    const likedByMe = existing.rows.length === 0;

    if (likedByMe) {
      await this.appwrite.tablesDB.createRow({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'z_entry_likes',
        rowId: ID.unique(),
        data: { entryId, userId, profileId: profile.$id },
      });
      const updated = await this.applyCounter(
        'z_entries',
        entryId,
        'likeCount',
        entry.likeCount,
        1,
      );
      return this.entrySocialState(updated, true);
    }

    await this.appwrite.tablesDB.deleteRow({
      databaseId: DashboardEntrySocialService.DB_ID,
      tableId: 'z_entry_likes',
      rowId: existing.rows[0].$id,
    });
    const updated = await this.applyCounter(
      'z_entries',
      entryId,
      'likeCount',
      entry.likeCount,
      -1,
    );
    return this.entrySocialState(updated, false);
  }

  async getEntryComments(
    entryId: string,
    page = 1,
    pageSize = 20,
    parentId?: string,
  ) {
    const entry = await this.getEntryById(entryId);
    this.assertFeedEntry(entry);
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safePageSize = Math.max(
      1,
      Math.min(Number.isFinite(pageSize) ? pageSize : 20, 50),
    );
    const queries = [
      Query.equal('entryId', entryId),
      parentId ? Query.equal('parentId', parentId) : Query.isNull('parentId'),
      Query.orderDesc('$createdAt'),
      Query.limit(safePageSize),
      Query.offset((safePage - 1) * safePageSize),
    ];
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardEntrySocialService.DB_ID,
      tableId: 'z_entry_comments',
      queries,
    });
    const profiles = await this.profiles.byIds(
      Array.from(
        new Set(result.rows.map((row) => row.profileId).filter(Boolean)),
      ),
    );
    const profileMap = new Map(
      profiles.map((profile) => [profile.$id, profile]),
    );

    return {
      items: result.rows.map((comment) => ({
        ...comment,
        userProfile: profileMap.get(comment.profileId) ?? null,
      })),
      total: result.total,
      hasMore: safePage * safePageSize < result.total,
    };
  }

  async createEntryComment(
    userId: string,
    entryId: string,
    rawContent: string,
    parentId?: string,
  ) {
    const content = rawContent.trim();
    if (!content)
      throw new BadRequestException('Comentário não pode ser vazio');

    const [profile, entry] = await Promise.all([
      this.profiles.byUserId(userId),
      this.getEntryById(entryId),
    ]);
    this.assertFeedEntry(entry);

    let depth = 0;
    let parent: any = null;
    if (parentId) {
      parent = await this.getEntryCommentById(parentId);
      if (parent.entryId !== entryId) {
        throw new BadRequestException(
          'Comentário pai pertence a outro registro',
        );
      }
      depth = (parent.depth ?? 0) + 1;
      if (depth > 2) {
        throw new BadRequestException('Limite de respostas atingido');
      }
    }

    const comment = await this.appwrite.tablesDB.createRow<any>({
      databaseId: DashboardEntrySocialService.DB_ID,
      tableId: 'z_entry_comments',
      rowId: ID.unique(),
      data: {
        entryId,
        profileId: profile.$id,
        content,
        parentId: parentId ?? null,
        depth,
        replyCount: 0,
      },
    });

    await this.applyCounter(
      'z_entries',
      entryId,
      'commentCount',
      entry.commentCount,
      1,
    );
    if (parentId) {
      await this.applyCounter(
        'z_entry_comments',
        parentId,
        'replyCount',
        parent?.replyCount,
        1,
      );
    }

    await this.notifyEntryOwner(entry, profile, content);
    return { ...comment, userProfile: profile };
  }

  async deleteEntryComment(
    userId: string,
    entryId: string,
    commentId: string,
    isAdmin = false,
  ) {
    const [profile, entry, comment] = await Promise.all([
      this.profiles.byUserId(userId),
      this.getEntryById(entryId),
      this.getEntryCommentById(commentId),
    ]);
    this.assertFeedEntry(entry);
    if (comment.entryId !== entryId) {
      throw new NotFoundException('Comentário não encontrado');
    }
    if (comment.profileId !== profile.$id && !isAdmin) {
      throw new ForbiddenException('Você não pode excluir este comentário');
    }

    const descendants = await this.getEntryCommentDescendants(
      entryId,
      commentId,
    );
    for (const row of [...descendants].reverse()) {
      await this.appwrite.tablesDB.deleteRow({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'z_entry_comments',
        rowId: row.$id,
      });
    }
    await this.appwrite.tablesDB.deleteRow({
      databaseId: DashboardEntrySocialService.DB_ID,
      tableId: 'z_entry_comments',
      rowId: commentId,
    });

    const deletedCount = descendants.length + 1;
    await this.applyCounter(
      'z_entries',
      entryId,
      'commentCount',
      entry.commentCount,
      -deletedCount,
    );
    if (comment.parentId) {
      const parent = await this.getEntryCommentById(comment.parentId).catch(
        () => null,
      );
      if (parent) {
        await this.applyCounter(
          'z_entry_comments',
          comment.parentId,
          'replyCount',
          parent.replyCount,
          -1,
        );
      }
    }

    return { success: true, deletedCount };
  }

  private async getEntryById(entryId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<any>({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'z_entries',
        rowId: entryId,
      });
    } catch {
      throw new NotFoundException('Registro não encontrado');
    }
  }

  private assertFeedEntry(entry: any) {
    if (
      !DashboardEntrySocialService.FEED_STATUS_MILESTONES.includes(entry.status)
    ) {
      throw new BadRequestException('Este registro não é publicável no feed');
    }
  }

  private entrySocialState(entry: any, likedByMe: boolean) {
    return {
      entryId: entry.$id,
      likeCount: entry.likeCount ?? 0,
      commentCount: entry.commentCount ?? 0,
      likedByMe,
    };
  }

  private async getEntryCommentById(commentId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<any>({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'z_entry_comments',
        rowId: commentId,
      });
    } catch {
      throw new NotFoundException('Comentário não encontrado');
    }
  }

  private async getEntryCommentDescendants(entryId: string, parentId: string) {
    const descendants: any[] = [];
    let frontier = [parentId];
    while (frontier.length > 0) {
      const result = await this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'z_entry_comments',
        queries: [
          Query.equal('entryId', entryId),
          Query.equal('parentId', frontier),
          Query.limit(100),
        ],
      });
      descendants.push(...result.rows);
      frontier = result.rows.map((row) => row.$id).filter(Boolean);
    }
    return descendants;
  }

  private async notifyEntryOwner(
    entry: any,
    sender: ProfileSummary,
    content: string,
  ) {
    const [owner] = await this.profiles.byFingerprints([
      entry.ownerFingerprint,
    ]);
    if (!owner || owner.$id === sender.$id) return;

    try {
      await this.appwrite.tablesDB.createRow({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId: 'notifications',
        rowId: ID.unique(),
        data: {
          recipientProfileId: owner.$id,
          senderProfileId: sender.$id,
          type: 'entry_comment',
          title: `${sender.gamertag} comentou no seu registro`,
          body: content,
          entityId: entry.$id,
          read: false,
        },
      });
    } catch {
      // A interação principal não deve falhar se a notificação estiver indisponível.
    }
  }

  private async applyCounter(
    tableId: string,
    rowId: string,
    column: string,
    currentValue: unknown,
    delta: number,
  ): Promise<CounterRow> {
    if (currentValue === null || currentValue === undefined) {
      return this.withTimeline(
        tableId,
        this.appwrite.tablesDB.updateRow<CounterRow>({
          databaseId: DashboardEntrySocialService.DB_ID,
          tableId,
          rowId,
          data: { [column]: Math.max(0, delta) },
        }),
      );
    }

    if (delta >= 0) {
      return this.withTimeline(
        tableId,
        this.appwrite.tablesDB.incrementRowColumn<CounterRow>({
          databaseId: DashboardEntrySocialService.DB_ID,
          tableId,
          rowId,
          column,
          value: delta,
        }),
      );
    }

    return this.withTimeline(
      tableId,
      this.appwrite.tablesDB.decrementRowColumn<CounterRow>({
        databaseId: DashboardEntrySocialService.DB_ID,
        tableId,
        rowId,
        column,
        value: Math.abs(delta),
        min: 0,
      }),
    );
  }

  private async withTimeline<T extends CounterRow>(
    tableId: string,
    pending: Promise<T>,
  ): Promise<T> {
    const row = await pending;
    if (
      tableId === 'z_entries' ||
      tableId === 'game_comments' ||
      tableId === 'lists'
    )
      await this.outbox.enqueueImmediate({
        type: 'SOCIAL_TIMELINE',
        payload: { table: tableId, row, action: 'update' },
      });
    return row;
  }
}
