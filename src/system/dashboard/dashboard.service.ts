import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TimelineService } from './timeline.service';
import { OutboxService } from 'src/infra/events/outbox.service';
import { DashboardListsService } from './dashboard-lists.service';
import { DashboardEntrySocialService } from './dashboard-entry-social.service';
import {
  DashboardProfilesService,
  type ProfileSummary,
} from './dashboard-profiles.service';

type VoteType = 'up' | 'down';

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
    private readonly lists: DashboardListsService,
    private readonly entrySocial: DashboardEntrySocialService,
    private readonly profiles: DashboardProfilesService,
  ) {}

  async getPersonalFeed(
    userId: string,
    page = 1,
    pageSize = 12,
    scope: 'connections' | 'mine' = 'connections',
    cursor?: string,
  ) {
    const profile = await this.profiles.byUserId(userId);
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
    const profile = await this.profiles.byUserId(userId);
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

    const candidateProfiles = await this.profiles.byFingerprints(
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
    return this.lists.getTrendingLists(userId, limit);
  }

  async getPublicLists(userId?: string, page = 1, pageSize = 12) {
    return this.lists.getPublicLists(userId, page, pageSize);
  }

  async getListSocialState(listId: string, userId?: string) {
    return this.lists.getListSocialState(listId, userId);
  }

  async toggleListLike(userId: string, listId: string) {
    return this.lists.toggleListLike(userId, listId);
  }

  async toggleListSave(userId: string, listId: string) {
    return this.lists.toggleListSave(userId, listId);
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
    return this.entrySocial.toggleEntryLike(userId, entryId);
  }

  async getEntryComments(
    entryId: string,
    page = 1,
    pageSize = 20,
    parentId?: string,
  ) {
    return this.entrySocial.getEntryComments(entryId, page, pageSize, parentId);
  }

  async createEntryComment(
    userId: string,
    entryId: string,
    rawContent: string,
    parentId?: string,
  ) {
    return this.entrySocial.createEntryComment(
      userId,
      entryId,
      rawContent,
      parentId,
    );
  }

  async deleteEntryComment(
    userId: string,
    entryId: string,
    commentId: string,
    isAdmin = false,
  ) {
    return this.entrySocial.deleteEntryComment(
      userId,
      entryId,
      commentId,
      isAdmin,
    );
  }

  async getSavedLists(userId: string, page = 1, pageSize = 12) {
    return this.lists.getSavedLists(userId, page, pageSize);
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
}
