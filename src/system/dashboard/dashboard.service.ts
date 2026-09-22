import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TimelineService } from './timeline.service';
import { OutboxService } from 'src/infra/events/outbox.service';

type ProfileSummary = {
  $id: string;
  userId?: string;
  fingerprint: string;
  gamertag: string;
  avatarUrl: string | null;
};

type VoteType = 'up' | 'down';

type CounterRow = Models.Row & Record<string, unknown>;

type ParentCommentSummary = {
  $id: string;
  content: string;
  $createdAt: string;
  userProfile: Pick<ProfileSummary, '$id' | 'gamertag' | 'avatarUrl'> | null;
};

@Injectable()
export class DashboardService {
  private static readonly DB_ID = 'app';

  /**
   * Status de `z_entries` que valem como marco social no feed. Mudanças de
   * status sem peso (ex.: `wishlist`) ficam de fora para reduzir ruído; e cada
   * par (dono, jogo) é deduplicado para o registro mais recente.
   */
  private static readonly FEED_STATUS_MILESTONES = [
    'completed',
    'backlog',
    'playing',
    'dropped',
  ];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly timeline: TimelineService,
    private readonly outbox: OutboxService,
  ) {}

  async getPersonalFeed(
    userId: string,
    page = 1,
    pageSize = 12,
    scope: 'connections' | 'mine' = 'connections',
    cursor?: string,
  ) {
    const profile = await this.getProfileByUserId(userId);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 50));
    const offset = (safePage - 1) * safePageSize;

    if (scope === 'mine') {
      return this.getOwnEntryFeed(userId, profile, offset, safePageSize);
    }

    return this.timeline.page(
      userId,
      profile.$id,
      safePage,
      safePageSize,
      cursor,
    );
  }

  private async getOwnEntryFeed(
    userId: string,
    profile: ProfileSummary,
    offset: number,
    pageSize: number,
  ) {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'z_entries',
      queries: [
        Query.equal('ownerFingerprint', profile.fingerprint),
        Query.equal('status', DashboardService.FEED_STATUS_MILESTONES),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });

    const seenGames = new Set<string>();
    const entries = result.rows.filter((entry) => {
      if (!entry.gameId || seenGames.has(entry.gameId)) return false;
      seenGames.add(entry.gameId);
      return true;
    });
    const [gameMap, entryLikeMap] = await Promise.all([
      this.getGameMap(entries.map((entry) => entry.gameId)),
      this.getEntryLikeMap(
        userId,
        entries.map((entry) => entry.$id).filter(Boolean),
      ),
    ]);
    const items = entries
      .map((entry) => ({
        $id: entry.$id,
        $createdAt: entry.$createdAt,
        type: 'status' as const,
        status: entry.status,
        likeCount: entry.likeCount ?? 0,
        commentCount: entry.commentCount ?? 0,
        likedByMe: entryLikeMap.has(entry.$id),
        userProfile: profile,
        game: gameMap.get(entry.gameId) ?? null,
      }))
      .filter((item) => item.game);

    return {
      items: items.slice(offset, offset + pageSize),
      hasMore: offset + pageSize < items.length,
    };
  }

  /**
   * `list_items` mais recentes das listas públicas informadas (janela de 100).
   * Cada linha carrega o jogo hidratado (`game.*`); a resolução de lista/autor
   * fica a cargo do chamador via `listById`.
   */
  private async getFollowedListItems(listRows: any[]) {
    const listIds = listRows.map((list) => list.$id).filter(Boolean);
    if (listIds.length === 0) return [];

    const listItems = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'list_items',
      queries: [
        Query.equal('list', listIds),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
        Query.select(['*', 'game.*']),
      ],
    });

    return listItems.rows;
  }

  /**
   * Sugere perfis para o usuário seguir, com base em afinidade: jogadores que
   * avaliaram os mesmos jogos. Se `seedGameIds` for informado (ex.: onboarding
   * passa os jogos recém-adicionados), usa-os como semente; caso contrário usa
   * os jogos que o próprio usuário já avaliou. Exclui o próprio usuário e quem
   * ele já segue.
   */
  async getSuggestedConnections(
    userId: string,
    limit = 6,
    seedGameIds: string[] = [],
  ) {
    const profile = await this.getProfileByUserId(userId);
    const safeLimit = Math.max(1, Math.min(limit, 24));

    let gameIds = seedGameIds.filter(Boolean);

    if (gameIds.length === 0) {
      const myRatings = await this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'ratings',
        queries: [
          Query.equal('ownerFingerprint', profile.fingerprint),
          Query.limit(100),
          Query.select(['gameId']),
        ],
      });
      gameIds = Array.from(
        new Set(myRatings.rows.map((r) => r.gameId).filter(Boolean)),
      );
    }

    if (gameIds.length === 0) {
      return { items: [] };
    }

    const ratings = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'ratings',
      queries: [
        Query.equal('gameId', gameIds.slice(0, 100)),
        Query.limit(100),
        Query.select(['ownerFingerprint']),
      ],
    });

    const sharedByFingerprint = new Map<string, number>();
    for (const rating of ratings.rows) {
      const fingerprint = rating.ownerFingerprint;
      if (!fingerprint || fingerprint === profile.fingerprint) continue;
      sharedByFingerprint.set(
        fingerprint,
        (sharedByFingerprint.get(fingerprint) ?? 0) + 1,
      );
    }

    if (sharedByFingerprint.size === 0) {
      return { items: [] };
    }

    const following = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'connections',
      queries: [
        Query.equal('requesterProfileId', profile.$id),
        Query.limit(100),
      ],
    });
    const followingIds = new Set(
      following.rows.map((c) => c.targetProfileId).filter(Boolean),
    );

    const candidateProfiles = await this.getProfilesByFingerprints(
      Array.from(sharedByFingerprint.keys()),
    );

    const items = candidateProfiles
      .filter(
        (candidate) =>
          candidate.$id !== profile.$id && !followingIds.has(candidate.$id),
      )
      .map((candidate) => ({
        ...candidate,
        sharedCount: sharedByFingerprint.get(candidate.fingerprint) ?? 0,
      }))
      .sort((a, b) => b.sharedCount - a.sharedCount)
      .slice(0, safeLimit);

    return { items };
  }

  async getTrendingLists(userId?: string, limit = 12) {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const [profile, lists] = await Promise.all([
      userId ? this.getProfileByUserId(userId).catch(() => null) : null,
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'lists',
        queries: [
          Query.equal('isPublic', true),
          Query.orderDesc('likeCount'),
          Query.orderDesc('saveCount'),
          Query.orderDesc('itemCount'),
          Query.orderDesc('$updatedAt'),
          Query.limit(safeLimit),
        ],
      }),
    ]);

    const fingerprints = Array.from(
      new Set(lists.rows.map((list) => list.ownerFingerprint).filter(Boolean)),
    );
    const profiles = await this.getProfilesByFingerprints(fingerprints);
    const profileByFingerprint = new Map(
      profiles.map((item) => [item.fingerprint, item]),
    );
    const state = profile
      ? await this.getListState(
          profile.userId,
          lists.rows.map((l) => l.$id),
        )
      : null;

    return {
      items: lists.rows.map((list) => ({
        ...this.normalizeList(list),
        author: profileByFingerprint.get(list.ownerFingerprint) ?? null,
        likedByMe: state?.liked.has(list.$id) ?? false,
        savedByMe: state?.saved.has(list.$id) ?? false,
      })),
    };
  }

  async getPublicLists(userId?: string, page = 1, pageSize = 12) {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
    const safePageSize = Number.isFinite(pageSize)
      ? Math.max(1, Math.min(Math.trunc(pageSize), 50))
      : 12;
    const offset = (safePage - 1) * safePageSize;

    const lists = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'lists',
      queries: [
        Query.equal('isPublic', true),
        Query.orderDesc('$createdAt'),
        Query.orderDesc('$id'),
        Query.limit(safePageSize),
        Query.offset(offset),
      ],
    });

    const total = lists.total;
    const totalPages = Math.ceil(total / safePageSize);

    if (lists.rows.length === 0) {
      return {
        items: [],
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages,
        hasMore: false,
      };
    }

    const fingerprints = Array.from(
      new Set(lists.rows.map((list) => list.ownerFingerprint).filter(Boolean)),
    );
    const [profiles, state] = await Promise.all([
      this.getProfilesByFingerprints(fingerprints),
      userId
        ? this.getListState(
            userId,
            lists.rows.map((list) => list.$id),
          )
        : null,
    ]);
    const profileByFingerprint = new Map(
      profiles.map((profile) => [profile.fingerprint, profile]),
    );

    return {
      items: lists.rows.map((list) => ({
        ...this.normalizeList(list),
        author: profileByFingerprint.get(list.ownerFingerprint) ?? null,
        likedByMe: state?.liked.has(list.$id) ?? false,
        savedByMe: state?.saved.has(list.$id) ?? false,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
      hasMore: safePage < totalPages,
    };
  }

  async getListSocialState(listId: string, userId?: string) {
    const list = await this.getListById(listId);
    const state = userId ? await this.getListState(userId, [listId]) : null;

    return {
      listId,
      likeCount: list.likeCount ?? 0,
      saveCount: list.saveCount ?? 0,
      likedByMe: state?.liked.has(listId) ?? false,
      savedByMe: state?.saved.has(listId) ?? false,
    };
  }

  async toggleListLike(userId: string, listId: string) {
    return this.toggleListRelation(userId, listId, 'list_likes', 'likeCount');
  }

  async toggleListSave(userId: string, listId: string) {
    return this.toggleListRelation(userId, listId, 'saved_lists', 'saveCount');
  }

  async voteComment(userId: string, commentId: string, operation: VoteType) {
    const comment = await this.getCommentById(commentId);
    const existingVoteResult = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'game_comment_votes',
      queries: [
        Query.equal('comment', commentId),
        Query.equal('userId', userId),
        Query.limit(1),
      ],
    });
    const existingVote = existingVoteResult.rows[0];

    let viewerVote: VoteType | null = operation;

    if (!existingVote) {
      await this.appwrite.tablesDB.createRow({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comment_votes',
        rowId: ID.unique(),
        data: {
          type: operation,
          comment: commentId,
          userId,
        },
      });
    } else if (existingVote.type === operation) {
      viewerVote = null;
      await this.appwrite.tablesDB.deleteRow({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comment_votes',
        rowId: existingVote.$id,
      });
    } else {
      await this.appwrite.tablesDB.updateRow({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comment_votes',
        rowId: existingVote.$id,
        data: {
          type: operation,
        },
      });
    }

    const previousVoteCount = comment.voteCount ?? 0;
    const newVoteCount = await this.getComputedCommentVoteCount(commentId);
    const delta = newVoteCount - previousVoteCount;

    if (newVoteCount !== previousVoteCount) {
      await this.appwrite.tablesDB.updateRow({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comments',
        rowId: commentId,
        data: {
          voteCount: newVoteCount,
        },
      });
    }

    if (newVoteCount !== previousVoteCount)
      await this.outbox.enqueueImmediate({
        type: 'SOCIAL_TIMELINE',
        payload: { table: 'game_comments', row: comment, action: 'update' },
      });
    return { success: true, delta, operation, newVoteCount, viewerVote };
  }

  async toggleEntryLike(userId: string, entryId: string) {
    const [profile, entry] = await Promise.all([
      this.getProfileByUserId(userId),
      this.getEntryById(entryId),
    ]);
    this.assertFeedEntry(entry);

    const existing = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
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
        databaseId: DashboardService.DB_ID,
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
      databaseId: DashboardService.DB_ID,
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
      databaseId: DashboardService.DB_ID,
      tableId: 'z_entry_comments',
      queries,
    });
    const profiles = await this.getProfilesByIds(
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
      this.getProfileByUserId(userId),
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
      databaseId: DashboardService.DB_ID,
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
      this.getProfileByUserId(userId),
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
        databaseId: DashboardService.DB_ID,
        tableId: 'z_entry_comments',
        rowId: row.$id,
      });
    }
    await this.appwrite.tablesDB.deleteRow({
      databaseId: DashboardService.DB_ID,
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

  private async toggleListRelation(
    userId: string,
    listId: string,
    tableId: 'list_likes' | 'saved_lists',
    counter: 'likeCount' | 'saveCount',
  ) {
    const [profile, list] = await Promise.all([
      this.getProfileByUserId(userId),
      this.getListById(listId),
    ]);

    const existing = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId,
      queries: [
        Query.equal('listId', listId),
        Query.equal('userId', userId),
        Query.limit(1),
      ],
    });

    const active = existing.total === 0;
    const nextCount = Math.max(0, (list[counter] ?? 0) + (active ? 1 : -1));

    if (active) {
      await this.appwrite.tablesDB.createRow({
        databaseId: DashboardService.DB_ID,
        tableId,
        rowId: ID.unique(),
        data: {
          listId,
          userId,
          profileId: profile.$id,
        },
      });
    } else {
      await this.appwrite.tablesDB.deleteRow({
        databaseId: DashboardService.DB_ID,
        tableId,
        rowId: existing.rows[0].$id,
      });
    }

    const updatedList = await this.appwrite.tablesDB.updateRow({
      databaseId: DashboardService.DB_ID,
      tableId: 'lists',
      rowId: listId,
      data: { [counter]: nextCount },
    });

    await this.outbox.enqueueImmediate({
      type: 'SOCIAL_TIMELINE',
      payload: { table: 'lists', row: updatedList, action: 'update' },
    });
    return {
      listId,
      likedByMe:
        counter === 'likeCount'
          ? active
          : (await this.getListState(userId, [listId])).liked.has(listId),
      savedByMe:
        counter === 'saveCount'
          ? active
          : (await this.getListState(userId, [listId])).saved.has(listId),
      likeCount: updatedList.likeCount ?? 0,
      saveCount: updatedList.saveCount ?? 0,
    };
  }

  async getSavedLists(userId: string, page = 1, pageSize = 12) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(pageSize, 50));
    const offset = (safePage - 1) * safeLimit;

    const saves = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'saved_lists',
      queries: [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(safeLimit),
        Query.offset(offset),
      ],
    });

    if (saves.rows.length === 0) {
      return { items: [], hasMore: false };
    }

    const listIds = saves.rows.map((s) => s.listId);

    const listsResult = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'lists',
      queries: [Query.equal('$id', listIds), Query.limit(listIds.length)],
    });

    const listsById = new Map(listsResult.rows.map((l) => [l.$id, l]));

    const orderedLists = saves.rows
      .map((s) => listsById.get(s.listId))
      .filter(Boolean);

    const fingerprints = Array.from(
      new Set(
        orderedLists.map((list) => list.ownerFingerprint).filter(Boolean),
      ),
    );
    const profiles = await this.getProfilesByFingerprints(fingerprints);
    const profileByFingerprint = new Map(
      profiles.map((item) => [item.fingerprint, item]),
    );

    const state = await this.getListState(
      userId,
      orderedLists.map((l) => l.$id),
    );

    return {
      items: orderedLists.map((list) => ({
        ...this.normalizeList(list),
        author: profileByFingerprint.get(list.ownerFingerprint) ?? null,
        likedByMe: state.liked.has(list.$id),
        savedByMe: state.saved.has(list.$id),
      })),
      hasMore: offset + safeLimit < saves.total,
    };
  }

  private async getProfileByUserId(userId: string) {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });

    const profile = result.rows[0];
    if (!profile)
      throw new NotFoundException('Perfil do usuário não encontrado');
    return profile;
  }

  private async getProfilesByIds(ids: string[]): Promise<ProfileSummary[]> {
    if (ids.length === 0) return [];

    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('$id', ids),
        Query.limit(ids.length),
        Query.select(['$id', 'userId', 'fingerprint', 'gamertag', 'avatarUrl']),
      ],
    });

    return result.rows;
  }

  private async getProfilesByFingerprints(fingerprints: string[]) {
    if (fingerprints.length === 0) return [];

    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('fingerprint', fingerprints),
        Query.limit(fingerprints.length),
        Query.select(['$id', 'userId', 'fingerprint', 'gamertag', 'avatarUrl']),
      ],
    });

    return result.rows;
  }

  private async getGameMap(gameIds: string[]) {
    const gameMap = new Map<string, any>();
    if (gameIds.length === 0) return gameMap;

    const games = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('$id', gameIds),
        Query.limit(gameIds.length),
        Query.select(['$id', 'name', 'slug', 'coverUrl']),
      ],
    });

    for (const game of games.rows) {
      gameMap.set(game.$id, game);
    }

    return gameMap;
  }

  private async getListById(listId: string) {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'lists',
      queries: [Query.equal('$id', listId), Query.limit(1)],
    });

    const list = result.rows[0];
    if (!list) throw new NotFoundException('Lista não encontrada');
    return list;
  }

  private async getCommentById(commentId: string) {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'game_comments',
      queries: [Query.equal('$id', commentId), Query.limit(1)],
    });

    const comment = result.rows[0];
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    return comment;
  }

  private async getCommentsByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'game_comments',
      queries: [
        Query.equal('$id', uniqueIds),
        Query.limit(uniqueIds.length),
        Query.select([
          '$id',
          '$createdAt',
          'content',
          'parentId',
          'userProfile.$id',
          'userProfile.gamertag',
          'userProfile.avatarUrl',
        ]),
      ],
    });

    return result.rows;
  }

  private async getParentCommentMap(comments: any[]) {
    const parentCommentIds = Array.from(
      new Set(comments.map((comment) => comment.parentId).filter(Boolean)),
    );
    const existingCommentsById = new Map<string, any>(
      comments
        .filter((comment) => comment.$id)
        .map((comment) => [comment.$id, comment]),
    );
    const missingParentIds = parentCommentIds.filter(
      (parentId) => !existingCommentsById.has(parentId),
    );
    const fetchedParents = await this.getCommentsByIds(missingParentIds);
    const parentById = new Map<string, any>([
      ...existingCommentsById,
      ...fetchedParents.map((parent) => [parent.$id, parent] as const),
    ]);

    return new Map<string, any>(
      comments
        .filter(
          (comment) => comment.parentId && parentById.has(comment.parentId),
        )
        .map((comment) => [comment.$id, parentById.get(comment.parentId)]),
    );
  }

  private async getCommentVoteMap(userId: string, commentIds: string[]) {
    const uniqueIds = Array.from(new Set(commentIds));
    if (uniqueIds.length === 0) return new Map<string, VoteType>();

    const votes = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'game_comment_votes',
      queries: [
        Query.equal('comment', uniqueIds),
        Query.equal('userId', userId),
        Query.limit(uniqueIds.length),
      ],
    });

    const entries: [string, VoteType][] = votes.rows
      .map((vote) => [this.getRelationId(vote.comment), vote.type])
      .filter(
        (entry): entry is [string, VoteType] =>
          Boolean(entry[0]) && (entry[1] === 'up' || entry[1] === 'down'),
      );

    return new Map<string, VoteType>(entries);
  }

  private async getEntryLikeMap(userId: string, entryIds: string[]) {
    const uniqueIds = Array.from(new Set(entryIds));
    if (uniqueIds.length === 0) return new Set<string>();

    const likes = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'z_entry_likes',
      queries: [
        Query.equal('entryId', uniqueIds),
        Query.equal('userId', userId),
        Query.limit(uniqueIds.length),
      ],
    });
    return new Set(likes.rows.map((like) => like.entryId).filter(Boolean));
  }

  private async getComputedCommentVoteCount(commentId: string) {
    const pageSize = 100;
    let offset = 0;
    let upvotes = 0;
    let downvotes = 0;

    while (true) {
      const result = await this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comment_votes',
        queries: [
          Query.equal('comment', commentId),
          Query.limit(pageSize),
          Query.offset(offset),
          Query.select(['type']),
        ],
      });

      for (const vote of result.rows) {
        if (vote.type === 'up') upvotes += 1;
        if (vote.type === 'down') downvotes += 1;
      }

      offset += result.rows.length;
      if (result.rows.length < pageSize) break;
    }

    return Math.max(0, upvotes - downvotes);
  }

  private async getParentCommentProfileMap(
    parentCommentMap: Map<string, any>,
    knownProfiles: Map<string, ProfileSummary>,
  ) {
    const parentProfileIds = Array.from(
      new Set(
        Array.from(parentCommentMap.values())
          .map((comment) => this.getRelationId(comment.userProfile))
          .filter((profileId) => profileId && !knownProfiles.has(profileId)),
      ),
    );
    const parentProfiles = await this.getProfilesByIds(parentProfileIds);

    return new Map<string, ProfileSummary>([
      ...knownProfiles,
      ...parentProfiles.map((profile) => [profile.$id, profile] as const),
    ]);
  }

  private toParentCommentSummary(
    comment: any,
    profileById: Map<string, ProfileSummary>,
  ): ParentCommentSummary | null {
    if (!comment) return null;

    const profileId = this.getRelationId(comment.userProfile);
    const userProfile =
      typeof comment.userProfile === 'object' && comment.userProfile
        ? {
            $id: comment.userProfile.$id,
            gamertag: comment.userProfile.gamertag,
            avatarUrl: comment.userProfile.avatarUrl ?? null,
          }
        : profileId && profileById.has(profileId)
          ? {
              $id: profileById.get(profileId)!.$id,
              gamertag: profileById.get(profileId)!.gamertag,
              avatarUrl: profileById.get(profileId)!.avatarUrl ?? null,
            }
          : null;

    return {
      $id: comment.$id,
      content: comment.content,
      $createdAt: comment.$createdAt,
      userProfile,
    };
  }

  private getRelationId(value: any) {
    return typeof value === 'string' ? value : value?.$id;
  }

  /**
   * Colunas de contagem criadas depois que a tabela já tinha registros ficam com
   * `null` (o `default` do Appwrite só vale na criação da row), e
   * increment/decrement sobre `null` é um no-op silencioso: responde 200, mexe
   * no `$updatedAt` e mantém o valor nulo. Nesses casos gravamos o valor
   * absoluto; com valor presente seguimos no caminho atômico.
   */
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
          databaseId: DashboardService.DB_ID,
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
          databaseId: DashboardService.DB_ID,
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
        databaseId: DashboardService.DB_ID,
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

  private async getEntryById(entryId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'z_entries',
        rowId: entryId,
      });
    } catch {
      throw new NotFoundException('Registro não encontrado');
    }
  }

  private assertFeedEntry(entry: any) {
    if (!DashboardService.FEED_STATUS_MILESTONES.includes(entry.status)) {
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
        databaseId: DashboardService.DB_ID,
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
        databaseId: DashboardService.DB_ID,
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
    const [owner] = await this.getProfilesByFingerprints([
      entry.ownerFingerprint,
    ]);
    if (!owner || owner.$id === sender.$id) return;

    try {
      await this.appwrite.tablesDB.createRow({
        databaseId: DashboardService.DB_ID,
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

  private async getListState(userId: string, listIds: string[]) {
    if (listIds.length === 0) {
      return { liked: new Set<string>(), saved: new Set<string>() };
    }

    const [likes, saves] = await Promise.all([
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'list_likes',
        queries: [
          Query.equal('userId', userId),
          Query.equal('listId', listIds),
          Query.limit(listIds.length),
        ],
      }),
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'saved_lists',
        queries: [
          Query.equal('userId', userId),
          Query.equal('listId', listIds),
          Query.limit(listIds.length),
        ],
      }),
    ]);

    return {
      liked: new Set(likes.rows.map((row) => row.listId)),
      saved: new Set(saves.rows.map((row) => row.listId)),
    };
  }

  private normalizeList(list: any) {
    return {
      ...list,
      likeCount: list.likeCount ?? 0,
      saveCount: list.saveCount ?? 0,
      itemCount: list.itemCount ?? 0,
      latestAdditions: list.latestAdditions ?? [],
    };
  }
}
