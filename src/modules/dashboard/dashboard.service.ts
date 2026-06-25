import { Injectable, NotFoundException } from '@nestjs/common';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

type ProfileSummary = {
  $id: string;
  fingerprint: string;
  gamertag: string;
  avatarUrl: string | null;
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
      queries: [
        Query.equal('$id', listIds),
        Query.limit(listIds.length)
      ],
    });

    const listsById = new Map(listsResult.rows.map((l) => [l.$id, l]));
    
    const orderedLists = saves.rows
        .map(s => listsById.get(s.listId))
        .filter(Boolean);

    const fingerprints = Array.from(
      new Set(orderedLists.map((list) => list.ownerFingerprint).filter(Boolean)),
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
