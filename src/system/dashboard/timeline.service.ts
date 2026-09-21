import crypto from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Query } from 'node-appwrite';
import Redis from 'ioredis';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';

type FeedType = 'rating' | 'comment' | 'list' | 'status' | 'list_item';
type Event = {
  $id: string;
  recipientUserId: string;
  actorProfileId: string;
  sourceType: FeedType;
  sourceId: string;
  occurredAt: string;
};

@Injectable()
export class TimelineService implements OnModuleDestroy {
  private readonly logger = new Logger(TimelineService.name);
  private readonly redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  );
  constructor(private readonly appwrite: Appwrite) {
    this.redis.on('error', (error) =>
      this.logger.warn(`Redis timeline: ${error.message}`),
    );
  }
  async onModuleDestroy() {
    this.redis.disconnect();
  }

  async backfillConnection(connection: any) {
    if (!connection?.requesterProfileId || !connection?.targetProfileId)
      return { success: true, noOp: true };
    const actor: any = await this.appwrite.tablesDB.getRow({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: connection.targetProfileId,
    });
    const recipient: any = await this.appwrite.tablesDB.getRow({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: connection.requesterProfileId,
    });
    if (!recipient?.userId) return { success: true, noOp: true };
    const tables = ['ratings', 'game_comments', 'lists', 'z_entries'];
    const publicListIds: string[] = [];
    for (const table of tables) {
      let cursor: string | undefined;
      for (;;) {
        const filters =
          table === 'game_comments'
            ? [Query.equal('userProfile', actor.$id)]
            : [Query.equal('ownerFingerprint', actor.fingerprint)];
        const result = await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: table,
          queries: [
            ...filters,
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        });
        for (const row of result.rows) {
          if (table === 'lists' && row.isPublic) publicListIds.push(row.$id);
          await this.ingest(table, row, 'create', recipient.userId);
        }
        if (result.rows.length < 100) break;
        cursor = result.rows.at(-1)?.$id;
      }
    }
    for (const listId of publicListIds) {
      let cursor: string | undefined;
      for (;;) {
        const result = await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'list_items',
          queries: [
            Query.equal('list', listId),
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        });
        for (const row of result.rows)
          await this.ingest('list_items', row, 'create', recipient.userId);
        if (result.rows.length < 100) break;
        cursor = result.rows.at(-1)?.$id;
      }
    }
    return { success: true };
  }

  async invalidateConnection(connection: any) {
    if (!connection?.requesterProfileId) return { success: true, noOp: true };
    const profile: any = await this.appwrite.tablesDB
      .getRow({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: connection.requesterProfileId,
      })
      .catch(() => null);
    if (profile?.userId) await this.invalidate(profile.userId);
    return { success: true };
  }

  private key(userId: string) {
    return `timeline:user:${userId}`;
  }
  async invalidate(userId: string) {
    const key = `${this.key(userId)}:version`;
    await this.redis
      .multi()
      .incr(key)
      .expire(key, 90)
      .exec()
      .catch(() => undefined);
  }

  async ingest(
    table: string,
    row: any,
    action: 'create' | 'update' | 'delete' = 'create',
    targetUserId?: string,
  ) {
    const sourceType = (
      {
        ratings: 'rating',
        game_comments: 'comment',
        lists: 'list',
        z_entries: 'status',
        list_items: 'list_item',
      } as Record<string, FeedType>
    )[table];
    if (!sourceType || !row?.$id) return { success: true, noOp: true };
    let actor: any;
    if (table === 'game_comments') {
      const id =
        typeof row.userProfile === 'string'
          ? row.userProfile
          : row.userProfile?.$id;
      if (!id) return { success: true, noOp: true };
      actor = await this.appwrite.tablesDB.getRow({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: id,
      });
    } else {
      let fingerprint = row.ownerFingerprint;
      if (table === 'list_items') {
        const listId = typeof row.list === 'string' ? row.list : row.list?.$id;
        const list: any = await this.appwrite.tablesDB
          .getRow({ databaseId: 'app', tableId: 'lists', rowId: listId })
          .catch(() => null);
        fingerprint = list?.isPublic ? list.ownerFingerprint : null;
      }
      if (!fingerprint) return { success: true, noOp: true };
      const profiles = await this.appwrite.tablesDB.listRows<any>({
        databaseId: 'app',
        tableId: 'user_profiles',
        queries: [Query.equal('fingerprint', fingerprint), Query.limit(1)],
      });
      actor = profiles.rows[0];
    }
    if (!actor?.$id) return { success: true, noOp: true };
    const valid =
      table !== 'z_entries' ||
      ['completed', 'backlog', 'playing', 'dropped'].includes(row.status);
    const publicList = table !== 'lists' || row.isPublic === true;
    const connections = targetUserId
      ? null
      : await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'connections',
          queries: [
            Query.equal('targetProfileId', actor.$id),
            Query.orderAsc('$id'),
            Query.limit(100),
          ],
        });
    let cursor: string | undefined;
    const recipients = new Set<string>(targetUserId ? [targetUserId] : []);
    for (let page = connections; page; ) {
      const ids = [
        ...new Set(
          page.rows
            .map((connection) => connection.requesterProfileId)
            .filter(Boolean),
        ),
      ];
      if (ids.length) {
        const profiles = await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'user_profiles',
          queries: [Query.equal('$id', ids), Query.limit(ids.length)],
        });
        for (const profile of profiles.rows)
          if (profile.userId) recipients.add(profile.userId);
      }
      if (page.rows.length < 100) break;
      cursor = page.rows.at(-1)?.$id;
      page = await this.appwrite.tablesDB.listRows<any>({
        databaseId: 'app',
        tableId: 'connections',
        queries: [
          Query.equal('targetProfileId', actor.$id),
          Query.orderAsc('$id'),
          Query.limit(100),
          Query.cursorAfter(cursor!),
        ],
      });
    }
    const idFor = (userId: string) =>
      crypto
        .createHash('sha256')
        .update(
          `${userId}:${sourceType}:${sourceType === 'status' ? `${actor.$id}:${row.gameId}` : row.$id}`,
        )
        .digest('hex')
        .slice(0, 32);
    const recipientsNeedingListItems = new Set<string>();
    for (const userId of recipients) {
      const rowId = idFor(userId);
      if (
        sourceType === 'list' &&
        action === 'update' &&
        row.isPublic === true
      ) {
        const existingListEvent = await this.appwrite.tablesDB
          .getRow({ databaseId: 'app', tableId: 'feed_events', rowId })
          .catch(() => null);
        if (!existingListEvent) recipientsNeedingListItems.add(userId);
      }
      if (action === 'delete' || !valid || !publicList) {
        const existing: any = await this.appwrite.tablesDB
          .getRow({ databaseId: 'app', tableId: 'feed_events', rowId })
          .catch(() => null);
        if (
          existing &&
          (sourceType !== 'status' || existing.sourceId === row.$id)
        )
          await this.appwrite.tablesDB
            .deleteRow({ databaseId: 'app', tableId: 'feed_events', rowId })
            .catch(() => undefined);
      } else {
        const existing: any =
          sourceType === 'status'
            ? await this.appwrite.tablesDB
                .getRow({ databaseId: 'app', tableId: 'feed_events', rowId })
                .catch(() => null)
            : null;
        if (
          !existing ||
          existing.occurredAt < row.$createdAt ||
          (existing.occurredAt === row.$createdAt &&
            existing.sourceId < row.$id)
        )
          await this.appwrite.tablesDB.upsertRow({
            databaseId: 'app',
            tableId: 'feed_events',
            rowId,
            data: {
              recipientUserId: userId,
              actorProfileId: actor.$id,
              sourceType,
              sourceId: row.$id,
              occurredAt: row.$createdAt,
            },
          });
      }
      await this.invalidate(userId);
    }
    if (
      sourceType === 'status' &&
      action === 'delete' &&
      row.gameId &&
      recipients.size
    ) {
      const remaining = await this.appwrite.tablesDB.listRows<any>({
        databaseId: 'app',
        tableId: 'z_entries',
        queries: [
          Query.equal('ownerFingerprint', actor.fingerprint),
          Query.equal('gameId', row.gameId),
          Query.equal('status', ['completed', 'backlog', 'playing', 'dropped']),
          Query.orderDesc('$createdAt'),
          Query.limit(1),
        ],
      });
      if (remaining.rows[0])
        for (const userId of recipients)
          await this.ingest('z_entries', remaining.rows[0], 'create', userId);
    }
    if (recipientsNeedingListItems.size > 0) {
      let itemCursor: string | undefined;
      for (;;) {
        const page = await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'list_items',
          queries: [
            Query.equal('list', row.$id),
            Query.orderAsc('$id'),
            Query.limit(100),
            ...(itemCursor ? [Query.cursorAfter(itemCursor)] : []),
          ],
        });
        for (const item of page.rows)
          for (const userId of recipientsNeedingListItems)
            await this.ingest('list_items', item, 'create', userId);
        if (page.rows.length < 100) break;
        itemCursor = page.rows.at(-1)?.$id;
      }
    }
    return { success: true, recipients: recipients.size };
  }

  async page(
    userId: string,
    profileId: string,
    page: number,
    pageSize: number,
    cursor?: string,
  ) {
    const safeSize = Math.max(1, Math.min(50, pageSize));
    const version =
      (await this.redis.get(`${this.key(userId)}:version`).catch(() => null)) ??
      '0';
    const cacheKey = `${this.key(userId)}:${version}:${page}:${safeSize}:${cursor ?? ''}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* Expired schema; fetch again. */
      }
    }
    const queries = [
      Query.equal('recipientUserId', userId),
      Query.orderDesc('occurredAt'),
      Query.orderDesc('$id'),
      Query.limit(safeSize + 1),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    else if (page > 1) queries.push(Query.offset((page - 1) * safeSize));
    const rows = await this.appwrite.tablesDB.listRows<any>({
      databaseId: 'app',
      tableId: 'feed_events',
      queries,
    });
    const slice = rows.rows.slice(0, safeSize);
    const actorIds = [...new Set(slice.map((event) => event.actorProfileId))];
    const actors = actorIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'user_profiles',
          queries: [Query.equal('$id', actorIds), Query.limit(actorIds.length)],
        })
      : { rows: [] };
    const byId = new Map<string, any>(
      actors.rows.map((actor: any) => [actor.$id, actor] as [string, any]),
    );
    const following = actorIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'connections',
          queries: [
            Query.equal('requesterProfileId', profileId),
            Query.equal('targetProfileId', actorIds),
            Query.limit(actorIds.length),
          ],
        })
      : { rows: [] };
    const followed = new Set(
      following.rows.map((connection: any) => connection.targetProfileId),
    );
    const tableByType = {
      rating: 'ratings',
      comment: 'game_comments',
      list: 'lists',
      status: 'z_entries',
      list_item: 'list_items',
    } as const;
    const sources = new Map<string, any>();
    await Promise.all(
      Object.entries(tableByType).map(async ([type, table]) => {
        const ids = slice
          .filter(
            (event) =>
              event.sourceType === type && followed.has(event.actorProfileId),
          )
          .map((event) => event.sourceId);
        if (!ids.length) return;
        const result = await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: table,
          queries: [Query.equal('$id', ids), Query.limit(ids.length)],
        });
        for (const row of result.rows) sources.set(`${type}:${row.$id}`, row);
      }),
    );
    const listIds = [
      ...new Set(
        slice
          .filter((event) => event.sourceType === 'list_item')
          .map((event) => sources.get(`list_item:${event.sourceId}`))
          .filter(Boolean)
          .map((source) =>
            typeof source.list === 'string' ? source.list : source.list?.$id,
          )
          .filter(Boolean),
      ),
    ];
    const lists = listIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'lists',
          queries: [Query.equal('$id', listIds), Query.limit(listIds.length)],
        })
      : { rows: [] };
    const listById = new Map<string, any>(
      lists.rows.map((list: any) => [list.$id, list] as [string, any]),
    );
    const gameIds = [
      ...new Set(
        slice
          .map((event) => {
            const source = sources.get(`${event.sourceType}:${event.sourceId}`);
            return event.sourceType === 'list_item'
              ? typeof source?.game === 'string'
                ? source.game
                : source?.game?.$id
              : source?.gameId;
          })
          .filter(Boolean),
      ),
    ];
    const games = gameIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'games',
          queries: [Query.equal('$id', gameIds), Query.limit(gameIds.length)],
        })
      : { rows: [] };
    const gameById = new Map<string, any>(
      games.rows.map((game: any) => [game.$id, game] as [string, any]),
    );
    const parentIds = [
      ...new Set(
        slice
          .filter((event) => event.sourceType === 'comment')
          .map((event) => sources.get(`comment:${event.sourceId}`))
          .filter(Boolean)
          .map((comment) =>
            typeof comment.parentId === 'string'
              ? comment.parentId
              : comment.parentId?.$id,
          )
          .filter(Boolean),
      ),
    ];
    const parents = parentIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          queries: [
            Query.equal('$id', parentIds),
            Query.limit(parentIds.length),
          ],
        })
      : { rows: [] };
    const parentById = new Map<string, any>(
      parents.rows.map(
        (comment: any) => [comment.$id, comment] as [string, any],
      ),
    );
    const parentProfileIds = [
      ...new Set(
        parents.rows
          .map((comment: any) =>
            typeof comment.userProfile === 'string'
              ? comment.userProfile
              : comment.userProfile?.$id,
          )
          .filter(Boolean),
      ),
    ];
    const parentProfiles = parentProfileIds.length
      ? await this.appwrite.tablesDB.listRows<any>({
          databaseId: 'app',
          tableId: 'user_profiles',
          queries: [
            Query.equal('$id', parentProfileIds),
            Query.limit(parentProfileIds.length),
          ],
        })
      : { rows: [] };
    const parentProfileById = new Map<string, any>(
      parentProfiles.rows.map(
        (profile: any) => [profile.$id, profile] as [string, any],
      ),
    );
    const commentIds = slice
      .filter((event) => event.sourceType === 'comment')
      .map((event) => event.sourceId);
    const statusIds = slice
      .filter((event) => event.sourceType === 'status')
      .map((event) => event.sourceId);
    const [votes, likes] = await Promise.all([
      commentIds.length
        ? this.appwrite.tablesDB.listRows<any>({
            databaseId: 'app',
            tableId: 'game_comment_votes',
            queries: [
              Query.equal('comment', commentIds),
              Query.equal('userId', userId),
              Query.limit(commentIds.length),
            ],
          })
        : Promise.resolve({ rows: [] }),
      statusIds.length
        ? this.appwrite.tablesDB.listRows<any>({
            databaseId: 'app',
            tableId: 'z_entry_likes',
            queries: [
              Query.equal('entryId', statusIds),
              Query.equal('userId', userId),
              Query.limit(statusIds.length),
            ],
          })
        : Promise.resolve({ rows: [] }),
    ]);
    const voteByComment = new Map<string, any>(
      votes.rows.map(
        (vote: any) =>
          [
            typeof vote.comment === 'string' ? vote.comment : vote.comment?.$id,
            vote.type,
          ] as [string, any],
      ),
    );
    const liked = new Set(likes.rows.map((like: any) => like.entryId));
    const items = slice
      .map((event) => {
        const actor = byId.get(event.actorProfileId);
        const source = sources.get(`${event.sourceType}:${event.sourceId}`);
        if (!actor || !followed.has(actor.$id) || !source) return null;
        if (event.sourceType === 'list' && !source.isPublic) return null;
        if (
          event.sourceType === 'status' &&
          !['completed', 'backlog', 'playing', 'dropped'].includes(
            source.status,
          )
        )
          return null;
        const listId =
          typeof source.list === 'string' ? source.list : source.list?.$id;
        const list =
          event.sourceType === 'list_item' ? listById.get(listId) : null;
        if (event.sourceType === 'list_item' && !list?.isPublic) return null;
        const gameId =
          event.sourceType === 'list_item'
            ? typeof source.game === 'string'
              ? source.game
              : source.game?.$id
            : source.gameId;
        const game = gameId ? (gameById.get(gameId) ?? null) : null;
        if (
          (event.sourceType === 'status' || event.sourceType === 'list_item') &&
          !game
        )
          return null;
        const parentId =
          typeof source.parentId === 'string'
            ? source.parentId
            : source.parentId?.$id;
        const parent =
          event.sourceType === 'comment' ? parentById.get(parentId) : null;
        const parentProfileId =
          typeof parent?.userProfile === 'string'
            ? parent.userProfile
            : parent?.userProfile?.$id;
        const parentProfile = parentProfileById.get(parentProfileId);
        const extra =
          event.sourceType === 'status'
            ? {
                likedByMe: liked.has(source.$id),
                likeCount: source.likeCount ?? 0,
                commentCount: source.commentCount ?? 0,
              }
            : event.sourceType === 'comment'
              ? {
                  viewerVote: voteByComment.get(source.$id) ?? null,
                  parentComment: parent
                    ? {
                        $id: parent.$id,
                        content: parent.content,
                        $createdAt: parent.$createdAt,
                        userProfile: parentProfile
                          ? {
                              $id: parentProfile.$id,
                              gamertag: parentProfile.gamertag,
                              avatarUrl: parentProfile.avatarUrl ?? null,
                            }
                          : null,
                      }
                    : null,
                }
              : event.sourceType === 'list'
                ? {
                    likeCount: source.likeCount ?? 0,
                    saveCount: source.saveCount ?? 0,
                    itemCount: source.itemCount ?? 0,
                    latestAdditions: source.latestAdditions ?? [],
                  }
                : {};
        return {
          ...source,
          $createdAt: event.occurredAt,
          type: event.sourceType,
          userProfile: {
            $id: actor.$id,
            gamertag: actor.gamertag,
            avatarUrl: actor.avatarUrl ?? null,
          },
          game,
          ...extra,
          ...(list
            ? { list: { $id: list.$id, title: list.title, slug: list.slug } }
            : {}),
        };
      })
      .filter(Boolean);
    const result = {
      items,
      hasMore: rows.rows.length > safeSize,
      nextCursor: rows.rows.length > safeSize ? slice.at(-1)?.$id : null,
    };
    await this.redis
      .set(cacheKey, JSON.stringify(result), 'EX', 45)
      .catch(() => undefined);
    return result;
  }
}
