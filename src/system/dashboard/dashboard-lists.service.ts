import { Injectable, NotFoundException } from '@nestjs/common';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { OutboxService } from 'src/infra/events/outbox.service';
import { DashboardProfilesService } from './dashboard-profiles.service';

@Injectable()
export class DashboardListsService {
  private static readonly DB_ID = 'app';

  constructor(
    private readonly appwrite: Appwrite,
    private readonly outbox: OutboxService,
    private readonly profiles: DashboardProfilesService,
  ) {}

  async getTrendingLists(userId?: string, limit = 12) {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const [profile, lists] = await Promise.all([
      userId ? this.profiles.byUserId(userId).catch(() => null) : null,
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardListsService.DB_ID,
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
    const profiles = await this.profiles.byFingerprints(fingerprints);
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
      databaseId: DashboardListsService.DB_ID,
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
      this.profiles.byFingerprints(fingerprints),
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

  async getSavedLists(userId: string, page = 1, pageSize = 12) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(pageSize, 50));
    const offset = (safePage - 1) * safeLimit;

    const saves = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardListsService.DB_ID,
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
      databaseId: DashboardListsService.DB_ID,
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
    const profiles = await this.profiles.byFingerprints(fingerprints);
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

  private async toggleListRelation(
    userId: string,
    listId: string,
    tableId: 'list_likes' | 'saved_lists',
    counter: 'likeCount' | 'saveCount',
  ) {
    const [profile, list] = await Promise.all([
      this.profiles.byUserId(userId),
      this.getListById(listId),
    ]);

    const existing = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardListsService.DB_ID,
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
        databaseId: DashboardListsService.DB_ID,
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
        databaseId: DashboardListsService.DB_ID,
        tableId,
        rowId: existing.rows[0].$id,
      });
    }

    const updatedList = await this.appwrite.tablesDB.updateRow({
      databaseId: DashboardListsService.DB_ID,
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

  private async getListById(listId: string) {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardListsService.DB_ID,
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
        databaseId: DashboardListsService.DB_ID,
        tableId: 'list_likes',
        queries: [
          Query.equal('userId', userId),
          Query.equal('listId', listIds),
          Query.limit(listIds.length),
        ],
      }),
      this.appwrite.tablesDB.listRows<any>({
        databaseId: DashboardListsService.DB_ID,
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
