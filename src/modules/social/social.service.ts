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
import {
  extractPlainTextFromHtml,
  sanitizeRichTextHtml,
} from 'src/common/utils/sanitize-rich-text';
import {
  buildForumPostSlug,
  MAX_FORUM_POST_CONTENT_LENGTH,
  MAX_FORUM_REPLY_CONTENT_LENGTH,
  MAX_FORUM_REPLY_DEPTH,
} from './forum.utils';

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
  private receiptId(kind: string, userId: string) {
    return crypto
      .createHash('sha256')
      .update(`${kind}:${userId}`)
      .digest('hex')
      .slice(0, 36);
  }

  private async optionalRow(
    tableId: string,
    rowId: string,
    transactionId?: string,
  ) {
    try {
      return await this.db.getRow<any>({
        databaseId: 'app',
        tableId,
        rowId,
        ...(transactionId ? { transactionId } : {}),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  /** Durable once-per-person milestone, in the same transaction as the entry. */
  private async firstGameSaved(
    txId: string,
    userId: string,
    fingerprint: string,
  ): Promise<boolean> {
    const rowId = this.receiptId('first_game_saved', userId);
    if (await this.optionalRow('app_logs', rowId, txId)) return false;
    const previous = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'z_entries',
      transactionId: txId,
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.isNotNull('status'),
        Query.limit(1),
      ],
    });
    const legacy = await this.db.listRows<any>({
      databaseId: 'app',
      tableId: 'z_entries_read',
      transactionId: txId,
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.isNotNull('status'),
        Query.limit(1),
      ],
    });
    const first = previous.rows.length === 0 && legacy.rows.length === 0;
    await this.db.createRow({
      databaseId: 'app',
      tableId: 'app_logs',
      rowId,
      transactionId: txId,
      data: {
        type: 'first_game_saved',
        relatedUserId: userId,
        metadata: JSON.stringify({ first }),
      },
    });
    return first;
  }

  /** Explicit set operation. Legacy toggle consumers keep their existing contract. */
  async ensureEntry(
    userId: string,
    data: { gameId: string; requestId: string },
    attempt = 0,
  ): Promise<any> {
    if (
      !/^[a-zA-Z0-9_-]{1,36}$/.test(data.gameId) ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(data.requestId)
    )
      throw new BadRequestException('Ação inválida');
    const profile = await this.profile(userId);
    await this.row('games', data.gameId);
    const receiptId = this.receiptId(`ensure:${data.requestId}`, userId);
    try {
      return await this.run(async ({ txId }) => {
        const receipt = await this.optionalRow('app_logs', receiptId, txId);
        if (receipt) {
          if (JSON.parse(receipt.metadata).gameId !== data.gameId)
            throw new BadRequestException('A ação pertence a outro jogo');
          return { saved: true, firstGameSaved: false };
        }
        // A shared row serializes overlapping ensure requests for this person.
        const lockId = this.receiptId('ensure_lock', userId);
        const lock = await this.optionalRow('app_logs', lockId, txId);
        const lockData = {
          type: 'entry_ensure_lock',
          relatedUserId: userId,
          metadata: data.requestId,
        };
        if (lock)
          await this.db.updateRow({
            databaseId: 'app',
            tableId: 'app_logs',
            rowId: lockId,
            transactionId: txId,
            data: lockData,
          });
        else
          await this.db.createRow({
            databaseId: 'app',
            tableId: 'app_logs',
            rowId: lockId,
            transactionId: txId,
            data: lockData,
          });
        const history = await this.db.listRows<any>({
          databaseId: 'app',
          tableId: 'z_entries',
          transactionId: txId,
          queries: [
            Query.equal('ownerFingerprint', profile.fingerprint),
            Query.equal('gameId', data.gameId),
            Query.orderDesc('$createdAt'),
            Query.orderDesc('$id'),
            Query.limit(1),
          ],
        });
        const current = await this.db.listRows<any>({
          databaseId: 'app',
          tableId: 'z_entries_read',
          transactionId: txId,
          queries: [
            Query.equal('ownerFingerprint', profile.fingerprint),
            Query.equal('gameId', data.gameId),
            Query.limit(1),
          ],
        });
        const prior = history.rows[0] ?? current.rows[0];
        let firstGameSaved = false;
        if (!prior?.status) {
          firstGameSaved = await this.firstGameSaved(
            txId,
            userId,
            profile.fingerprint,
          );
          const fields = Object.fromEntries(
            [
              'liked',
              'hyped',
              'playedPlatform',
              'playedPlatformId',
              'playtimeMinutes',
            ]
              .filter((key) => prior?.[key] !== undefined)
              .map((key) => [key, prior[key]]),
          );
          const entry = await this.db.createRow<any>({
            databaseId: 'app',
            tableId: 'z_entries',
            rowId: ID.unique(),
            transactionId: txId,
            data: {
              ...fields,
              gameId: data.gameId,
              ownerFingerprint: profile.fingerprint,
              status: 'wishlist',
            },
          });
          await this.outbox.enqueue(txId, {
            type: 'SOCIAL_ENTRY_SYNC',
            payload: { entryId: entry.$id },
          });
          await this.event(txId, 'z_entries', entry, 'create');
        }
        await this.db.createRow({
          databaseId: 'app',
          tableId: 'app_logs',
          rowId: receiptId,
          transactionId: txId,
          data: {
            type: 'entry_ensured',
            relatedUserId: userId,
            metadata: JSON.stringify({ gameId: data.gameId }),
          },
        });
        return { saved: true, firstGameSaved };
      });
    } catch (error) {
      if ((error as { code?: number }).code === 409 && attempt < 2)
        return this.ensureEntry(userId, data, attempt + 1);
      throw error;
    }
  }

  async createEntry(userId: string, data: any, attempt = 0): Promise<any> {
    const profile = await this.profile(userId);
    if (!data?.gameId || typeof data.gameId !== 'string')
      throw new BadRequestException('Jogo obrigatório');
    const allowed = [
      'gameId',
      'status',
      'liked',
      'hyped',
      'playedPlatform',
      'playedPlatformId',
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
      'playedPlatformId',
      'completionType',
      'playtimeMinutes',
    ])
      if (clean[key] === undefined && prior?.[key] !== undefined)
        clean[key] = prior[key];
    if (data.playedPlatformId !== undefined) {
      if (data.playedPlatformId !== null) {
        if (
          typeof data.playedPlatformId !== 'string' ||
          !data.playedPlatformId ||
          data.playedPlatformId.length > 36
        )
          throw new BadRequestException('Plataforma inválida');
        if (data.playedPlatform != null)
          throw new BadRequestException('Informe apenas uma plataforma');
        await this.row('game_platforms', data.playedPlatformId);
      }
      clean.playedPlatform = data.playedPlatform ?? null;
    } else if (data.playedPlatform !== undefined && prior?.playedPlatformId) {
      clean.playedPlatformId = null;
    }
    if (data.status !== undefined)
      clean.status = data.status === prior?.status ? null : data.status;
    if (clean.status === null) delete clean.status;
    if (clean.status !== 'completed') clean.completionType = null;
    const id = ID.unique();
    try {
      const row = await this.run(async ({ txId }) => {
        const firstGameSaved = clean.status
          ? await this.firstGameSaved(txId, userId, profile.fingerprint)
          : false;
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
        return { ...created, firstGameSaved };
      });
      return row;
    } catch (error) {
      if ((error as { code?: number }).code === 409 && attempt < 2)
        return this.createEntry(userId, data, attempt + 1);
      throw error;
    }
  }
  async createComment(userId: string, data: any) {
    const profile = await this.profile(userId);
    if (!data?.gameId || typeof data.content !== 'string')
      throw new BadRequestException('Comentário inválido');
    const sanitizedContent = sanitizeRichTextHtml(data.content);
    const plainText = extractPlainTextFromHtml(sanitizedContent);
    if (!plainText) throw new BadRequestException('Comentário inválido');

    const parentId = data.parentId ?? null;
    const parent = parentId ? await this.row('game_comments', parentId) : null;
    if (parent && parent.gameId !== data.gameId)
      throw new BadRequestException('Resposta pertence a outro jogo');

    const depth = parent ? (parent.depth ?? 0) + 1 : 0;
    if (depth > MAX_FORUM_REPLY_DEPTH)
      throw new BadRequestException(
        'Limite de profundidade de respostas atingido',
      );

    let title: string | null = null;
    if (!parent) {
      if (data.title !== undefined && data.title !== null) {
        const trimmedTitle = String(data.title).trim();
        if (trimmedTitle.length < 3 || trimmedTitle.length > 255)
          throw new BadRequestException(
            'Título deve ter entre 3 e 255 caracteres',
          );
        title = trimmedTitle;
      }
      if (sanitizedContent.length > MAX_FORUM_POST_CONTENT_LENGTH)
        throw new BadRequestException('Publicação excede o tamanho máximo');
    } else if (sanitizedContent.length > MAX_FORUM_REPLY_CONTENT_LENGTH) {
      throw new BadRequestException('Resposta excede o tamanho máximo');
    }

    const id = ID.unique();
    const slug = !parent
      ? buildForumPostSlug(title || plainText, id)
      : undefined;

    return this.run(async ({ txId }) => {
      const baseData: Record<string, any> = {
        gameId: data.gameId,
        userProfile: profile.$id,
        content: sanitizedContent,
        parentId,
        depth,
      };
      const rowData: Record<string, any> = !parent
        ? {
            ...baseData,
            ...(title ? { title } : {}),
            ...(slug ? { slug } : {}),
          }
        : baseData;

      let row: any;
      try {
        row = await this.db.createRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: id,
          data: rowData,
          transactionId: txId,
        });
      } catch (err: any) {
        if (
          !parent &&
          err?.code === 400 &&
          err?.type === 'document_invalid_structure'
        ) {
          row = await this.db.createRow<any>({
            databaseId: 'app',
            tableId: 'game_comments',
            rowId: id,
            data: baseData,
            transactionId: txId,
          });
        } else {
          throw err;
        }
      }

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
      const enriched = {
        ...row,
        $id: id,
        ...(title && !row?.title ? { title } : {}),
        ...(slug && !row?.slug ? { slug } : {}),
      };
      await this.event(
        txId,
        'game_comments',
        { ...enriched, userProfile: profile.$id },
        'create',
      );
      return enriched;
    });
  }
  async updateComment(userId: string, id: string, data: any, isAdmin = false) {
    const profile = await this.profile(userId);
    const row = await this.row('game_comments', id);
    const owner =
      typeof row.userProfile === 'string'
        ? row.userProfile
        : row.userProfile?.$id;
    if (owner !== profile.$id && !isAdmin) throw new ForbiddenException();

    const isRoot = !this.relationId(row.parentId);
    const patch: Record<string, any> = {};

    if (data?.title !== undefined) {
      if (!isRoot)
        throw new BadRequestException('Respostas não possuem título');
      const trimmedTitle = String(data.title).trim();
      if (trimmedTitle.length < 3 || trimmedTitle.length > 255)
        throw new BadRequestException(
          'Título deve ter entre 3 e 255 caracteres',
        );
      patch.title = trimmedTitle;
      patch.slug = buildForumPostSlug(trimmedTitle, row.$id);
    }

    if (data?.content !== undefined) {
      const sanitizedContent = sanitizeRichTextHtml(String(data.content));
      const plainText = extractPlainTextFromHtml(sanitizedContent);
      if (!plainText) throw new BadRequestException('Conteúdo inválido');
      const maxLen = isRoot
        ? MAX_FORUM_POST_CONTENT_LENGTH
        : MAX_FORUM_REPLY_CONTENT_LENGTH;
      if (sanitizedContent.length > maxLen)
        throw new BadRequestException('Conteúdo excede o tamanho máximo');
      patch.content = sanitizedContent;
    }

    if (Object.keys(patch).length === 0)
      throw new BadRequestException('Nenhuma alteração informada');

    return this.run(async ({ txId }) => {
      let updated: any;
      try {
        updated = await this.db.updateRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: id,
          data: patch,
          transactionId: txId,
        });
      } catch (err: any) {
        if (
          err?.code === 400 &&
          err?.type === 'document_invalid_structure' &&
          patch.content !== undefined
        ) {
          updated = await this.db.updateRow<any>({
            databaseId: 'app',
            tableId: 'game_comments',
            rowId: id,
            data: { content: patch.content },
            transactionId: txId,
          });
        } else {
          throw err;
        }
      }
      const enriched = {
        ...row,
        ...updated,
        ...patch,
      };
      await this.event(txId, 'game_comments', enriched, 'update');
      return enriched;
    });
  }
  async deleteComment(userId: string, id: string, isAdmin = false) {
    const profile = await this.profile(userId);
    const row = await this.row('game_comments', id);
    const owner =
      typeof row.userProfile === 'string'
        ? row.userProfile
        : row.userProfile?.$id;
    if (owner !== profile.$id && !isAdmin) throw new ForbiddenException();

    const descendants = await this.getCommentDescendants(id);
    const parentId = this.relationId(row.parentId);

    await this.run(async ({ txId }) => {
      for (const descendant of [...descendants].reverse()) {
        await this.db.deleteRow({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: descendant.$id,
          transactionId: txId,
        });
        await this.event(txId, 'game_comments', descendant, 'delete');
      }
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'game_comments',
        rowId: id,
        transactionId: txId,
      });
      if (parentId)
        await this.db.createOperations({
          transactionId: txId,
          operations: [
            {
              action: 'decrement',
              databaseId: 'app',
              tableId: 'game_comments',
              rowId: parentId,
              data: { column: 'replyCount', value: 1 },
            },
          ],
        });
      await this.event(txId, 'game_comments', row, 'delete');
      if (parentId)
        await this.event(
          txId,
          'game_comments',
          await this.row('game_comments', parentId),
          'update',
        );
    });
    return { success: true, deletedCount: descendants.length + 1 };
  }
  private async getCommentDescendants(commentId: string) {
    if (!this.db.listRows) return [];
    const descendants: any[] = [];
    let frontier = [commentId];
    while (frontier.length > 0) {
      const result = await this.db
        .listRows<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          queries: [Query.equal('parentId', frontier), Query.limit(100)],
        })
        .catch(() => ({ rows: [] }));
      const nextRows = (result?.rows ?? []).filter(
        (item: any) =>
          item?.$id &&
          item.$id !== commentId &&
          frontier.includes(this.relationId(item.parentId)),
      );
      if (!nextRows.length) break;
      descendants.push(...nextRows);
      frontier = nextRows.map((item: any) => item.$id);
    }
    return descendants;
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
