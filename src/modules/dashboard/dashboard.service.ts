import { Injectable, NotFoundException } from '@nestjs/common';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

type ProfileSummary = {
  $id: string;
  userId?: string;
  fingerprint: string;
  gamertag: string;
  avatarUrl: string | null;
};

type VoteType = 'up' | 'down';

type ParentCommentSummary = {
  $id: string;
  content: string;
  $createdAt: string;
  userProfile: Pick<ProfileSummary, '$id' | 'gamertag' | 'avatarUrl'> | null;
};

@Injectable()
export class DashboardService {
  private static readonly DB_ID = 'app';

  constructor(private readonly appwrite: Appwrite) {}

  async getPersonalFeed(userId: string, page = 1, pageSize = 12) {
    const profile = await this.getProfileByUserId(userId);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 50));
    const offset = (safePage - 1) * safePageSize;

    const connections = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'connections',
      queries: [
        Query.equal('requesterProfileId', profile.$id),
        Query.limit(100),
      ],
    });

    const followedProfileIds = connections.rows
      .map((connection) => connection.targetProfileId)
      .filter(Boolean);

    if (followedProfileIds.length === 0) {
      return { items: [], hasMore: false };
    }

    const followedProfiles = await this.getProfilesByIds(followedProfileIds);
    const followedFingerprints = followedProfiles.map((p) => p.fingerprint);

    if (followedFingerprints.length === 0) {
      return { items: [], hasMore: false };
    }

    const [ratings, comments, lists] = await Promise.all([
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'ratings',
        queries: [
          Query.equal('ownerFingerprint', followedFingerprints),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ],
      }),
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'game_comments',
        queries: [
          Query.equal('userProfile', followedProfileIds),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
          Query.select([
            '*',
            'userProfile.$id',
            'userProfile.gamertag',
            'userProfile.avatarUrl',
          ]),
        ],
      }),
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardService.DB_ID,
        tableId: 'lists',
        queries: [
          Query.equal('ownerFingerprint', followedFingerprints),
          Query.equal('isPublic', true),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ],
      }),
    ]);

    const profileByFingerprint = new Map(
      followedProfiles.map((p) => [p.fingerprint, p]),
    );
    const profileById = new Map(followedProfiles.map((p) => [p.$id, p]));

    const gameIds = Array.from(
      new Set(
        [...ratings.rows, ...comments.rows]
          .map((item) => item.gameId)
          .filter(Boolean),
      ),
    );
    const gameMap = await this.getGameMap(gameIds);
    const [parentCommentMap, commentVoteMap] = await Promise.all([
      this.getParentCommentMap(comments.rows),
      this.getCommentVoteMap(
        userId,
        comments.rows.map((comment) => comment.$id).filter(Boolean),
      ),
    ]);
    const parentProfileById = await this.getParentCommentProfileMap(
      parentCommentMap,
      profileById,
    );

    const items = [
      ...ratings.rows.map((rating) => ({
        ...rating,
        type: 'rating' as const,
        userProfile: profileByFingerprint.get(rating.ownerFingerprint) ?? null,
        game: rating.gameId ? (gameMap.get(rating.gameId) ?? null) : null,
      })),
      ...comments.rows.map((comment) => {
        const profileId =
          typeof comment.userProfile === 'string'
            ? comment.userProfile
            : comment.userProfile?.$id;

        return {
          ...comment,
          type: 'comment' as const,
          userProfile: profileId ? (profileById.get(profileId) ?? null) : null,
          game: comment.gameId ? (gameMap.get(comment.gameId) ?? null) : null,
          parentComment: this.toParentCommentSummary(
            parentCommentMap.get(comment.$id),
            parentProfileById,
          ),
          viewerVote: commentVoteMap.get(comment.$id) ?? null,
        };
      }),
      ...lists.rows.map((list) => ({
        ...this.normalizeList(list),
        type: 'list' as const,
        userProfile: profileByFingerprint.get(list.ownerFingerprint) ?? null,
      })),
    ]
      .filter((item) => item.userProfile)
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));

    return {
      items: items.slice(offset, offset + safePageSize),
      hasMore: offset + safePageSize < items.length,
    };
  }

  /**
   * Jogos que perfis seguidos pelo usuário adicionaram recentemente às suas
   * listas públicas. Resolve o grafo de conexões → listas públicas dos
   * seguidos → `list_items` mais recentes dessas listas, e hidrata autor,
   * lista e jogo. Endpoint dedicado (não o feed) porque `list_items` é criado
   * com muito mais frequência e teria sua própria janela de paginação.
   */
  async getConnectionsListActivity(userId: string, page = 1, pageSize = 12) {
    const profile = await this.getProfileByUserId(userId);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 50));
    const offset = (safePage - 1) * safePageSize;

    const connections = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'connections',
      queries: [
        Query.equal('requesterProfileId', profile.$id),
        Query.limit(100),
      ],
    });

    const followedProfileIds = connections.rows
      .map((connection) => connection.targetProfileId)
      .filter(Boolean);

    if (followedProfileIds.length === 0) {
      return { items: [], hasMore: false };
    }

    const followedProfiles = await this.getProfilesByIds(followedProfileIds);
    const followedFingerprints = followedProfiles.map((p) => p.fingerprint);

    if (followedFingerprints.length === 0) {
      return { items: [], hasMore: false };
    }

    const lists = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardService.DB_ID,
      tableId: 'lists',
      queries: [
        Query.equal('ownerFingerprint', followedFingerprints),
        Query.equal('isPublic', true),
        Query.limit(100),
        Query.select(['$id', 'title', 'slug', 'ownerFingerprint']),
      ],
    });

    if (lists.rows.length === 0) {
      return { items: [], hasMore: false };
    }

    const listById = new Map(lists.rows.map((list) => [list.$id, list]));
    const listIds = lists.rows.map((list) => list.$id);
    const profileByFingerprint = new Map(
      followedProfiles.map((p) => [p.fingerprint, p]),
    );

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

    const items = listItems.rows
      .map((item) => {
        const listId = this.getRelationId(item.list);
        const list = listId ? listById.get(listId) : null;
        const author = list
          ? (profileByFingerprint.get(list.ownerFingerprint) ?? null)
          : null;
        const game =
          typeof item.game === 'object' && item.game
            ? {
                $id: item.game.$id,
                name: item.game.name,
                slug: item.game.slug,
                coverUrl: item.game.coverUrl ?? null,
              }
            : null;

        if (!list || !author || !game) return null;

        return {
          $id: item.$id,
          $createdAt: item.$createdAt,
          author,
          list: { $id: list.$id, title: list.title, slug: list.slug },
          game,
        };
      })
      .filter(Boolean);

    return {
      items: items.slice(offset, offset + safePageSize),
      hasMore: offset + safePageSize < items.length,
    };
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

    return { success: true, delta, operation, newVoteCount, viewerVote };
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
