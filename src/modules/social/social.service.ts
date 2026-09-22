import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Models, Permission, Query, Role } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { OutboxService } from 'src/infra/events/outbox.service';
import { TimelineService } from 'src/system/dashboard/timeline.service';
import crypto from 'node:crypto';
import { slugify } from 'src/common/utils/slugify';

@Injectable()
export class SocialService {
  constructor(
    private readonly appwrite: Appwrite,
    private readonly transactions: TransactionService,
    private readonly outbox: OutboxService,
    private readonly timeline: TimelineService,
  ) {}
  private async run<T>(
    work: (ctx: { txId: string }) => Promise<T>,
  ): Promise<T> {
    const result = await this.transactions.runInTransaction(work);
    void this.outbox.processOutbox().catch(() => undefined);
    return result;
  }
  private get db() {
    return this.appwrite.tablesDB;
  }
  private async profile(userId: string) {
    const result = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    if (!result.rows[0]) throw new NotFoundException('Perfil não encontrado');
    return result.rows[0];
  }
  private async row(tableId: string, rowId: string) {
    return this.db
      .getRow<any>({ databaseId: 'app', tableId, rowId })
      .catch(() => {
        throw new NotFoundException('Recurso não encontrado');
      });
  }
  private async ownFingerprint(table: string, id: string, fingerprint: string) {
    const row = await this.row(table, id);
    if (row.ownerFingerprint !== fingerprint) throw new ForbiddenException();
    return row;
  }
  private async event(
    txId: string,
    table: string,
    row: any,
    action: 'create' | 'update' | 'delete',
  ) {
    await this.outbox.enqueue(txId, {
      type: 'SOCIAL_TIMELINE',
      payload: { table, row, action },
    });
  }
  async createEntry(userId: string, data: any) {
    const profile = await this.profile(userId);
    if (!data?.gameId || typeof data.gameId !== 'string')
      throw new BadRequestException('Jogo obrigatório');
    const allowed = [
      'gameId',
      'status',
      'liked',
      'hyped',
      'playedPlatform',
      'completionType',
      'playtimeMinutes',
    ];
    const priorResults = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'z_entries_read',
      queries: [
        Query.equal('ownerFingerprint', profile.fingerprint),
        Query.equal('gameId', data.gameId),
        Query.limit(1),
      ],
    });
    const prior = priorResults.rows[0];
    const clean = Object.fromEntries(
      allowed.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]),
    );
    for (const key of [
      'status',
      'liked',
      'hyped',
      'playedPlatform',
      'completionType',
      'playtimeMinutes',
    ])
      if (clean[key] === undefined && prior?.[key] !== undefined)
        clean[key] = prior[key];
    if (data.status !== undefined)
      clean.status = data.status === prior?.status ? null : data.status;
    if (clean.status === null) delete clean.status;
    if (clean.status !== 'completed') clean.completionType = null;
    const id = ID.unique();
    const row = await this.run(async ({ txId }) => {
      const created = await this.db.createRow<any>({
        databaseId: 'app',
        tableId: 'z_entries',
        rowId: id,
        data: { ...clean, ownerFingerprint: profile.fingerprint },
        transactionId: txId,
      });
      await this.outbox.enqueue(txId, {
        type: 'SOCIAL_ENTRY_SYNC',
        payload: { entryId: id },
      });
      await this.event(
        txId,
        'z_entries',
        { ...created, $id: id, ownerFingerprint: profile.fingerprint },
        'create',
      );
      return created;
    });
    return row;
  }
  async createComment(userId: string, data: any) {
    const profile = await this.profile(userId);
    if (
      !data?.gameId ||
      typeof data.content !== 'string' ||
      !data.content.trim()
    )
      throw new BadRequestException('Comentário inválido');
    const parentId = data.parentId ?? null;
    const parent = parentId ? await this.row('game_comments', parentId) : null;
    if (parent && parent.gameId !== data.gameId)
      throw new BadRequestException('Resposta pertence a outro jogo');
    const id = ID.unique();
    return this.run(async ({ txId }) => {
      const row = await this.db.createRow<any>({
        databaseId: 'app',
        tableId: 'game_comments',
        rowId: id,
        data: {
          gameId: data.gameId,
          userProfile: profile.$id,
          content: data.content.trim(),
          parentId,
          depth: parent ? (parent.depth ?? 0) + 1 : 0,
        },
        transactionId: txId,
      });
      if (parent) {
        await this.db.createOperations({
          transactionId: txId,
          operations: [
            {
              action: 'increment',
              databaseId: 'app',
              tableId: 'game_comments',
              rowId: parentId,
              data: { column: 'replyCount', value: 1 },
            },
          ],
        });
        await this.event(txId, 'game_comments', parent, 'update');
        await this.outbox.enqueue(txId, {
          type: 'SOCIAL_COMMENT_REPLY',
          payload: { commentId: id },
        });
      }
      await this.event(
        txId,
        'game_comments',
        { ...row, $id: id, userProfile: profile.$id },
        'create',
      );
      return row;
    });
  }
  async deleteComment(userId: string, id: string) {
    const profile = await this.profile(userId);
    const row = await this.row('game_comments', id);
    const owner =
      typeof row.userProfile === 'string'
        ? row.userProfile
        : row.userProfile?.$id;
    if (owner !== profile.$id) throw new ForbiddenException();
    await this.run(async ({ txId }) => {
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'game_comments',
        rowId: id,
        transactionId: txId,
      });
      if (row.parentId)
        await this.db.createOperations({
          transactionId: txId,
          operations: [
            {
              action: 'decrement',
              databaseId: 'app',
              tableId: 'game_comments',
              rowId:
                typeof row.parentId === 'string'
                  ? row.parentId
                  : row.parentId.$id,
              data: { column: 'replyCount', value: 1 },
            },
          ],
        });
      await this.event(txId, 'game_comments', row, 'delete');
      if (row.parentId)
        await this.event(
          txId,
          'game_comments',
          await this.row(
            'game_comments',
            typeof row.parentId === 'string' ? row.parentId : row.parentId.$id,
          ),
          'update',
        );
    });
    return { success: true };
  }
  async voteComment(userId: string, id: string, type: 'up' | 'down' | null) {
    const comment = await this.row('game_comments', id);
    if (type !== null && type !== 'up' && type !== 'down')
      throw new BadRequestException('Voto inválido');
    const voteId = crypto
      .createHash('sha256')
      .update(`${userId}:${id}`)
      .digest('hex')
      .slice(0, 32);
    const existingVotes = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'game_comment_votes',
      queries: [
        Query.equal('comment', id),
        Query.equal('userId', userId),
        Query.limit(1),
      ],
    });
    const old = existingVotes.rows[0] ?? null;
    const actualVoteId = old?.$id ?? voteId;
    const oldValue = old?.type === 'up' ? 1 : old?.type === 'down' ? -1 : 0;
    const nextValue = type === 'up' ? 1 : type === 'down' ? -1 : 0;
    let rawScore = 0;
    let offset = 0;
    for (;;) {
      const page = await this.db.listRows<any>({
        databaseId: 'app',
        tableId: 'game_comment_votes',
        queries: [
          Query.equal('comment', id),
          Query.limit(100),
          Query.offset(offset),
        ],
      });
      for (const vote of page.rows)
        rawScore += vote.type === 'up' ? 1 : vote.type === 'down' ? -1 : 0;
      if (page.rows.length < 100) break;
      offset += page.rows.length;
    }
    const voteCount = Math.max(0, rawScore + nextValue - oldValue);
    const delta = voteCount - (comment.voteCount ?? 0);
    await this.run(async ({ txId }) => {
      if (type)
        await this.db.upsertRow({
          databaseId: 'app',
          tableId: 'game_comment_votes',
          rowId: actualVoteId,
          data: { comment: id, userId, type },
          permissions: [Permission.read(Role.user(userId))],
          transactionId: txId,
        });
      else if (old)
        await this.db.deleteRow({
          databaseId: 'app',
          tableId: 'game_comment_votes',
          rowId: actualVoteId,
          transactionId: txId,
        });
      if (delta !== 0)
        await this.db.createOperations({
          transactionId: txId,
          operations: [
            {
              action: delta > 0 ? 'increment' : 'decrement',
              databaseId: 'app',
              tableId: 'game_comments',
              rowId: id,
              data: {
                column: 'voteCount',
                value: Math.abs(delta),
              },
            },
          ],
        });
      await this.event(txId, 'game_comments', comment, 'update');
    });
    return {
      voteCount,
      viewerVote: type,
    };
  }
  async createList(userId: string, data: any) {
    const profile = await this.profile(userId);
    if (typeof data?.title !== 'string' || !data.title.trim())
      throw new BadRequestException('Título obrigatório');
    const clean = Object.fromEntries(
      ['title', 'description', 'isPublic']
        .filter((k) => data[k] !== undefined)
        .map((k) => [k, data[k]]),
    );
    const id = ID.unique();
    return this.run(async ({ txId }) => {
      const row = await this.db.createRow<any>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        data: {
          ...clean,
          slug: slugify(clean.title),
          itemCount: 0,
          latestAdditions: [],
          coverImageUrls: [],
          ownerFingerprint: profile.fingerprint,
        },
        transactionId: txId,
      });
      await this.event(
        txId,
        'lists',
        { ...row, $id: id, ownerFingerprint: profile.fingerprint },
        'create',
      );
      return row;
    });
  }
  async updateList(userId: string, id: string, data: any) {
    const profile = await this.profile(userId);
    await this.ownFingerprint('lists', id, profile.fingerprint);
    const clean = Object.fromEntries(
      ['title', 'description', 'isPublic', 'coverImageUrls']
        .filter((k) => data[k] !== undefined)
        .map((k) => [k, data[k]]),
    );
    return this.run(async ({ txId }) => {
      const row = await this.db.updateRow<any>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        data: {
          ...clean,
          ...(clean.title ? { slug: slugify(clean.title) } : {}),
        },
        transactionId: txId,
      });
      await this.event(txId, 'lists', row, 'update');
      return row;
    });
  }
  async deleteList(userId: string, id: string) {
    const profile = await this.profile(userId);
    const row = await this.ownFingerprint('lists', id, profile.fingerprint);
    const itemIds: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.db.listRows<any>({
        databaseId: 'app',
        tableId: 'list_items',
        queries: [
          Query.equal('list', id),
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      itemIds.push(...page.rows.map((item: any) => item.$id));
      if (page.rows.length < 100) break;
      cursor = page.rows.at(-1).$id;
    }
    await this.run(async ({ txId }) => {
      for (let offset = 0; offset < itemIds.length; offset += 50)
        await this.outbox.enqueue(txId, {
          type: 'SOCIAL_LIST_ITEMS_DELETED',
          payload: {
            itemIds: itemIds.slice(offset, offset + 50),
            actorProfileId: profile.$id,
          },
        });
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
      });
      await this.event(txId, 'lists', row, 'delete');
    });
    return { success: true };
  }
  private relationId(value: any) {
    return typeof value === 'string' ? value : value?.$id;
  }
  async createItem(userId: string, listId: string, data: any) {
    const profile = await this.profile(userId);
    await this.ownFingerprint('lists', listId, profile.fingerprint);
    if (!data?.gameId || !data?.orderKey || data.orderKey.length > 48)
      throw new BadRequestException('Item inválido');
    const list = await this.row('lists', listId);
    const game = await this.row('games', data.gameId);
    let gameName = String(game.name ?? '').slice(0, 80);
    let gameCoverUrl = String(game.coverUrl ?? '');
    let addition = JSON.stringify({
      orderKey: data.orderKey,
      gameId: data.gameId,
      gameName,
      gameCoverUrl,
    });
    while (addition.length > 240 && gameName.length) {
      gameName = gameName.slice(0, -1);
      addition = JSON.stringify({
        orderKey: data.orderKey,
        gameId: data.gameId,
        gameName,
        gameCoverUrl,
      });
    }
    if (addition.length > 240) {
      gameCoverUrl = '';
      gameName = String(game.name ?? '').slice(0, 80);
      addition = JSON.stringify({
        orderKey: data.orderKey,
        gameId: data.gameId,
        gameName,
        gameCoverUrl,
      });
      while (addition.length > 240 && gameName.length) {
        gameName = gameName.slice(0, -1);
        addition = JSON.stringify({
          orderKey: data.orderKey,
          gameId: data.gameId,
          gameName,
          gameCoverUrl,
        });
      }
      if (addition.length > 240)
        throw new BadRequestException(
          'Metadados do jogo excedem o limite da lista',
        );
    }
    const latestAdditions = [
      addition,
      ...(list.latestAdditions ?? []).filter((raw: string) => {
        try {
          return JSON.parse(raw).gameId !== data.gameId;
        } catch {
          return false;
        }
      }),
    ].slice(0, 3);
    const id = ID.unique();
    const result = await this.run(async ({ txId }) => {
      const row = await this.db.createRow<any>({
        databaseId: 'app',
        tableId: 'list_items',
        rowId: id,
        data: { list: listId, game: data.gameId, orderKey: data.orderKey },
        transactionId: txId,
      });
      await this.db.createOperations({
        transactionId: txId,
        operations: [
          {
            action: 'increment',
            databaseId: 'app',
            tableId: 'lists',
            rowId: listId,
            data: { column: 'itemCount', value: 1 },
          },
        ],
      });
      const updatedList = await this.db.updateRow<any>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: listId,
        data: { latestAdditions, lastOrderKey: data.orderKey },
        transactionId: txId,
      });
      await this.event(
        txId,
        'list_items',
        { ...row, $id: id, list: listId },
        'create',
      );
      await this.event(txId, 'lists', updatedList, 'update');
      return { updatedList, newItem: row };
    });
    return { ...result, updatedList: await this.row('lists', listId) };
  }
  async updateItem(userId: string, listId: string, id: string, data: any) {
    const profile = await this.profile(userId);
    await this.ownFingerprint('lists', listId, profile.fingerprint);
    const item = await this.row('list_items', id);
    if (this.relationId(item.list) !== listId) throw new ForbiddenException();
    if (typeof data?.orderKey !== 'string')
      throw new BadRequestException('Ordem inválida');
    return this.run(async ({ txId }) => {
      const row = await this.db.updateRow<any>({
        databaseId: 'app',
        tableId: 'list_items',
        rowId: id,
        data: { orderKey: data.orderKey },
        transactionId: txId,
      });
      const list = await this.row('lists', listId);
      const siblings = await this.db.listRows<any>({
        databaseId: 'app',
        tableId: 'list_items',
        queries: [
          Query.equal('list', listId),
          Query.orderDesc('orderKey'),
          Query.limit(2),
        ],
      });
      const lastOrderKey =
        [
          data.orderKey,
          ...siblings.rows
            .filter((x: any) => x.$id !== id)
            .map((x: any) => x.orderKey),
        ]
          .sort()
          .at(-1) ?? data.orderKey;
      await this.db.updateRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: listId,
        data: { lastOrderKey },
        transactionId: txId,
      });
      await this.event(txId, 'list_items', row, 'update');
      await this.event(txId, 'lists', list, 'update');
      return row;
    });
  }
  async deleteItem(userId: string, listId: string, id: string) {
    const profile = await this.profile(userId);
    await this.ownFingerprint('lists', listId, profile.fingerprint);
    const row = await this.row('list_items', id);
    if (this.relationId(row.list) !== listId) throw new ForbiddenException();
    const list = await this.row('lists', listId);
    const latestAdditions = (list.latestAdditions ?? []).filter(
      (raw: string) => {
        try {
          return JSON.parse(raw).gameId !== this.relationId(row.game);
        } catch {
          return true;
        }
      },
    );
    await this.run(async ({ txId }) => {
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'list_items',
        rowId: id,
        transactionId: txId,
      });
      await this.db.updateRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: listId,
        data: { latestAdditions },
        transactionId: txId,
      });
      await this.db.createOperations({
        transactionId: txId,
        operations: [
          {
            action: 'decrement',
            databaseId: 'app',
            tableId: 'lists',
            rowId: listId,
            data: { column: 'itemCount', value: 1 },
          },
        ],
      });
      await this.event(txId, 'list_items', row, 'delete');
      await this.event(txId, 'lists', { ...list, latestAdditions }, 'update');
    });
    return this.row('lists', listId);
  }
  async follow(userId: string, targetProfileId: string) {
    const profile = await this.profile(userId);
    if (profile.$id === targetProfileId)
      throw new BadRequestException('Não é possível seguir a si mesmo');
    await this.row('user_profiles', targetProfileId);
    const existing = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'connections',
      queries: [
        Query.equal('requesterProfileId', profile.$id),
        Query.equal('targetProfileId', targetProfileId),
        Query.limit(1),
      ],
    });
    if (existing.rows[0]) return existing.rows[0];
    const id = ID.unique();
    const row = await this.run(async ({ txId }) => {
      const created = await this.db.createRow<any>({
        databaseId: 'app',
        tableId: 'connections',
        rowId: id,
        data: { requesterProfileId: profile.$id, targetProfileId },
        transactionId: txId,
      });
      await this.outbox.enqueue(txId, {
        type: 'SOCIAL_CONNECTION',
        payload: {
          connection: {
            ...created,
            $id: id,
            requesterProfileId: profile.$id,
            targetProfileId,
          },
          action: 'create',
        },
      });
      return created;
    });
    await this.timeline.invalidate(userId);
    return row;
  }
  async unfollow(userId: string, id: string) {
    const profile = await this.profile(userId);
    const row = await this.row('connections', id);
    if (row.requesterProfileId !== profile.$id) throw new ForbiddenException();
    await this.run(async ({ txId }) => {
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'connections',
        rowId: id,
        transactionId: txId,
      });
      await this.outbox.enqueue(txId, {
        type: 'SOCIAL_CONNECTION',
        payload: { connection: row, action: 'delete' },
      });
    });
    await this.timeline.invalidate(userId);
    return { success: true };
  }
}
