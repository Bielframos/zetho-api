import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Query } from 'node-appwrite';
import { extractPlainTextFromHtml } from 'src/common/utils/sanitize-rich-text';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import {
  buildForumPostSlug,
  deriveForumPostExcerpt,
  deriveForumPostTitle,
  extractIdFromForumSlug,
} from './forum.utils';

export type ForumSortOrder = 'recent' | 'top';

export type ForumAuthorSummary = {
  $id: string;
  gamertag: string;
  avatarUrl: string | null;
};

export type ForumGameSummary = {
  $id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  releaseYear: string | null;
};

export type ForumReplyItem = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  gameId: string;
  parentId: string | null;
  depth: number;
  content: string;
  voteCount: number;
  replyCount: number;
  viewerVote: 'up' | 'down' | null;
  author: ForumAuthorSummary | null;
};

export type ForumPostSummary = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  gameId: string;
  title: string;
  hasExplicitTitle: boolean;
  slug: string;
  content: string;
  excerpt: string;
  voteCount: number;
  replyCount: number;
  viewerVote: 'up' | 'down' | null;
  author: ForumAuthorSummary | null;
  game: ForumGameSummary | null;
};

export type ForumPostDetailResponse = {
  post: ForumPostSummary & {
    seo: {
      indexable: boolean;
      canonicalSlug: string;
      description: string;
    };
  };
  seo: {
    indexable: boolean;
    canonicalSlug: string;
    description: string;
  };
  replies: {
    items: ForumReplyItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  focusedThread: {
    targetId: string;
    targetCommentId: string;
    ancestorIds: string[];
    repliesByParent: Record<string, ForumReplyItem[]>;
  } | null;
};

const DB_ID = 'app';
const COMMENTS_TABLE = 'game_comments';
const VOTES_TABLE = 'game_comment_votes';
const GAMES_TABLE = 'games';
const PROFILES_TABLE = 'user_profiles';
const MIN_PLAIN_TEXT_FOR_INDEX = 20;

@Injectable()
export class ForumService {
  private readonly logger = new Logger(ForumService.name);

  constructor(private readonly appwrite: Appwrite) {}

  private get db() {
    return this.appwrite.tablesDB;
  }

  async listPosts(options: {
    page?: number;
    pageSize?: number;
    gameId?: string;
    gameSlug?: string;
    sort?: ForumSortOrder;
    viewerUserId?: string;
  }) {
    const safePage = Number.isFinite(options.page)
      ? Math.max(1, Math.floor(options.page!))
      : 1;
    const safePageSize = Number.isFinite(options.pageSize)
      ? Math.max(1, Math.min(Math.floor(options.pageSize!), 50))
      : 12;
    const sort: ForumSortOrder = options.sort === 'top' ? 'top' : 'recent';
    const offset = (safePage - 1) * safePageSize;

    let selectedGame: ForumGameSummary | null = null;
    let resolvedGameId = options.gameId?.trim() || undefined;

    if (options.gameSlug?.trim() && !resolvedGameId) {
      selectedGame = await this.findGameBySlug(options.gameSlug.trim());
      if (!selectedGame) {
        return {
          items: [] as ForumPostSummary[],
          total: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 0,
          hasMore: false,
          selectedGame: null,
          game: null,
        };
      }
      resolvedGameId = selectedGame.$id;
    } else if (resolvedGameId) {
      selectedGame = await this.findGameById(resolvedGameId);
    }

    const queries = [
      Query.isNull('parentId'),
      ...(resolvedGameId ? [Query.equal('gameId', resolvedGameId)] : []),
      ...(sort === 'top'
        ? [
            Query.orderDesc('voteCount'),
            Query.orderDesc('$createdAt'),
            Query.orderDesc('$id'),
          ]
        : [Query.orderDesc('$createdAt'), Query.orderDesc('$id')]),
      Query.limit(safePageSize),
      Query.offset(offset),
    ];

    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: COMMENTS_TABLE,
      queries,
    });

    const items = await this.hydratePostSummaries(
      result.rows,
      options.viewerUserId,
      selectedGame ? new Map([[selectedGame.$id, selectedGame]]) : undefined,
    );

    const totalPages = Math.ceil(result.total / safePageSize);
    return {
      items,
      total: result.total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
      hasMore: safePage < totalPages,
      selectedGame,
      game: selectedGame,
    };
  }

  async getPostBySlugOrId(
    slugOrId: string,
    options?: {
      commentId?: string;
      viewerUserId?: string;
      replyPageSize?: number;
      sort?: ForumSortOrder;
    },
  ): Promise<ForumPostDetailResponse> {
    const resolved = await this.resolveCommentRow(slugOrId);
    if (!resolved) {
      throw new NotFoundException('Publicação não encontrada');
    }

    let rootRow = resolved;
    let implicitFocusId: string | undefined;

    if (this.extractParentId(resolved)) {
      implicitFocusId = resolved.$id;
      rootRow = await this.walkToRootComment(resolved);
    }

    const [postSummary] = await this.hydratePostSummaries(
      [rootRow],
      options?.viewerUserId,
    );

    const replyPageSize = Math.max(
      1,
      Math.min(options?.replyPageSize ?? 15, 50),
    );
    const repliesPage = await this.getReplies(rootRow.$id, {
      page: 1,
      pageSize: replyPageSize,
      sort: options?.sort ?? 'top',
      viewerUserId: options?.viewerUserId,
    });

    const targetCommentId = options?.commentId?.trim() || implicitFocusId;
    let focusedThread: ForumPostDetailResponse['focusedThread'] = null;

    if (targetCommentId && targetCommentId !== rootRow.$id) {
      focusedThread = await this.buildFocusedThread(
        rootRow.$id,
        targetCommentId,
        options?.viewerUserId,
      );
    }

    const plainText = extractPlainTextFromHtml(postSummary.content);
    const indexable =
      postSummary.hasExplicitTitle ||
      plainText.length >= MIN_PLAIN_TEXT_FOR_INDEX;
    const description =
      postSummary.excerpt ||
      (postSummary.game
        ? `Participe da discussão sobre ${postSummary.game.name} no Fórum do Zetho.`
        : 'Participe da discussão na comunidade do Zetho.');

    const seo = {
      indexable,
      canonicalSlug: postSummary.slug,
      description,
    };

    return {
      post: {
        ...postSummary,
        seo,
      },
      seo,
      replies: repliesPage,
      focusedThread,
    };
  }

  async getReplies(
    parentId: string,
    options?: {
      page?: number;
      pageSize?: number;
      sort?: ForumSortOrder;
      viewerUserId?: string;
    },
  ) {
    const safePage = Number.isFinite(options?.page)
      ? Math.max(1, Math.floor(options!.page!))
      : 1;
    const safePageSize = Number.isFinite(options?.pageSize)
      ? Math.max(1, Math.min(Math.floor(options!.pageSize!), 50))
      : 10;
    const sort: ForumSortOrder = options?.sort === 'recent' ? 'recent' : 'top';
    const offset = (safePage - 1) * safePageSize;

    const queries = [
      Query.equal('parentId', parentId),
      ...(sort === 'top'
        ? [
            Query.orderDesc('voteCount'),
            Query.orderAsc('$createdAt'),
            Query.orderAsc('$id'),
          ]
        : [Query.orderDesc('$createdAt'), Query.orderDesc('$id')]),
      Query.limit(safePageSize),
      Query.offset(offset),
    ];

    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: COMMENTS_TABLE,
      queries,
    });

    const items = await this.hydrateReplyItems(
      result.rows,
      options?.viewerUserId,
    );

    return {
      items,
      total: result.total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + items.length < result.total,
    };
  }

  async listIndexablePostsForSitemap(
    maxItems = 1000,
  ): Promise<{ slug: string; lastmod?: string }[]> {
    const entries: { slug: string; lastmod?: string }[] = [];
    let offset = 0;
    const pageSize = 100;

    while (entries.length < maxItems) {
      const result = await this.db.listRows<any>({
        databaseId: DB_ID,
        tableId: COMMENTS_TABLE,
        queries: [
          Query.isNull('parentId'),
          Query.orderDesc('$createdAt'),
          Query.limit(pageSize),
          Query.offset(offset),
        ],
      });

      if (!result.rows.length) break;

      for (const row of result.rows) {
        const hasTitle = Boolean(row.title?.trim());
        const plain = extractPlainTextFromHtml(row.content);
        if (!hasTitle && plain.length < MIN_PLAIN_TEXT_FOR_INDEX) continue;

        entries.push({
          slug:
            row.slug?.trim() ||
            buildForumPostSlug(row.title || row.content || '', row.$id),
          lastmod: row.$updatedAt || row.$createdAt,
        });
        if (entries.length >= maxItems) break;
      }

      if (result.rows.length < pageSize) break;
      offset += result.rows.length;
    }

    return entries;
  }

  private async resolveCommentRow(slugOrId: string): Promise<any | null> {
    const trimmed = slugOrId?.trim();
    if (!trimmed) return null;

    const extractedId = extractIdFromForumSlug(trimmed);
    if (extractedId) {
      const byExtractedId = await this.db
        .getRow<any>({
          databaseId: DB_ID,
          tableId: COMMENTS_TABLE,
          rowId: extractedId,
        })
        .catch(() => null);
      if (byExtractedId) return byExtractedId;
    }

    const byDirectId = await this.db
      .getRow<any>({
        databaseId: DB_ID,
        tableId: COMMENTS_TABLE,
        rowId: trimmed,
      })
      .catch(() => null);
    if (byDirectId) return byDirectId;

    try {
      const bySlug = await this.db.listRows<any>({
        databaseId: DB_ID,
        tableId: COMMENTS_TABLE,
        queries: [Query.equal('slug', trimmed), Query.limit(1)],
      });
      if (bySlug.rows[0]) return bySlug.rows[0];
    } catch (error) {
      this.logger.debug(
        `Busca por slug "${trimmed}" indisponível: ${String(error)}`,
      );
    }

    return null;
  }

  private async walkToRootComment(comment: any): Promise<any> {
    let current = comment;
    const visited = new Set<string>([current.$id]);

    for (let hop = 0; hop < 6; hop += 1) {
      const parentId = this.extractParentId(current);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);

      const parent = await this.db
        .getRow<any>({
          databaseId: DB_ID,
          tableId: COMMENTS_TABLE,
          rowId: parentId,
        })
        .catch(() => null);
      if (!parent) break;
      current = parent;
    }

    return current;
  }

  private async buildFocusedThread(
    rootId: string,
    targetId: string,
    viewerUserId?: string,
  ): Promise<ForumPostDetailResponse['focusedThread']> {
    const target = await this.db
      .getRow<any>({
        databaseId: DB_ID,
        tableId: COMMENTS_TABLE,
        rowId: targetId,
      })
      .catch(() => null);
    if (!target) return null;

    const chain: any[] = [target];
    let current = target;
    const visited = new Set<string>([target.$id]);

    for (let hop = 0; hop < 6; hop += 1) {
      const parentId = this.extractParentId(current);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      if (parentId === rootId) {
        break;
      }
      const parent = await this.db
        .getRow<any>({
          databaseId: DB_ID,
          tableId: COMMENTS_TABLE,
          rowId: parentId,
        })
        .catch(() => null);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }

    if (this.extractParentId(chain[0]) !== rootId) {
      return null;
    }

    const ancestorIds = [rootId, ...chain.slice(0, -1).map((c) => c.$id)];
    const repliesByParent: Record<string, ForumReplyItem[]> = {};

    await Promise.all(
      ancestorIds.map(async (parentId) => {
        const page = await this.getReplies(parentId, {
          page: 1,
          pageSize: 50,
          sort: 'top',
          viewerUserId,
        });
        repliesByParent[parentId] = page.items;
      }),
    );

    const hydratedChain = await this.hydrateReplyItems(chain, viewerUserId);
    for (const item of hydratedChain) {
      const parentId = item.parentId;
      if (!parentId) continue;
      const list = repliesByParent[parentId] ?? [];
      if (!list.some((existing) => existing.$id === item.$id)) {
        repliesByParent[parentId] = [item, ...list];
      }
    }

    return {
      targetId,
      targetCommentId: targetId,
      ancestorIds,
      repliesByParent,
    };
  }

  private async hydratePostSummaries(
    rows: any[],
    viewerUserId?: string,
    preloadedGames?: Map<string, ForumGameSummary>,
  ): Promise<ForumPostSummary[]> {
    if (!rows.length) return [];

    const gameIds = Array.from(
      new Set(
        rows
          .map((row) => row.gameId)
          .filter(
            (gameId): gameId is string =>
              Boolean(gameId) && !preloadedGames?.has(gameId),
          ),
      ),
    );
    const profileIds = Array.from(
      new Set(
        rows
          .map((row) => this.extractProfileId(row.userProfile))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const postIds = rows.map((row) => row.$id).filter(Boolean);

    const [gamesMap, profilesMap, votesMap] = await Promise.all([
      this.fetchGamesMap(gameIds, preloadedGames),
      this.fetchProfilesMap(rows, profileIds),
      this.fetchViewerVotesMap(postIds, viewerUserId),
    ]);

    return rows.map((row) => {
      const game = row.gameId ? (gamesMap.get(row.gameId) ?? null) : null;
      const profileId = this.extractProfileId(row.userProfile);
      const author = profileId ? (profilesMap.get(profileId) ?? null) : null;
      const title = deriveForumPostTitle(row.title, row.content, game?.name);
      const slug =
        row.slug?.trim() ||
        buildForumPostSlug(row.title || row.content || title, row.$id);

      return {
        $id: row.$id,
        $createdAt: row.$createdAt,
        $updatedAt: row.$updatedAt ?? row.$createdAt,
        gameId: row.gameId,
        title,
        hasExplicitTitle: Boolean(row.title?.trim()),
        slug,
        content: row.content ?? '',
        excerpt: deriveForumPostExcerpt(row.content, 220),
        voteCount: row.voteCount ?? 0,
        replyCount: row.replyCount ?? 0,
        viewerVote: votesMap.get(row.$id) ?? null,
        author,
        game,
      };
    });
  }

  private async hydrateReplyItems(
    rows: any[],
    viewerUserId?: string,
  ): Promise<ForumReplyItem[]> {
    if (!rows.length) return [];

    const profileIds = Array.from(
      new Set(
        rows
          .map((row) => this.extractProfileId(row.userProfile))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const commentIds = rows.map((row) => row.$id).filter(Boolean);

    const [profilesMap, votesMap] = await Promise.all([
      this.fetchProfilesMap(rows, profileIds),
      this.fetchViewerVotesMap(commentIds, viewerUserId),
    ]);

    return rows.map((row) => {
      const profileId = this.extractProfileId(row.userProfile);
      const author = profileId ? (profilesMap.get(profileId) ?? null) : null;

      return {
        $id: row.$id,
        $createdAt: row.$createdAt,
        $updatedAt: row.$updatedAt ?? row.$createdAt,
        gameId: row.gameId,
        parentId: this.extractParentId(row),
        depth: row.depth ?? 1,
        content: row.content ?? '',
        voteCount: row.voteCount ?? 0,
        replyCount: row.replyCount ?? 0,
        viewerVote: votesMap.get(row.$id) ?? null,
        author,
      };
    });
  }

  private async findGameBySlug(slug: string): Promise<ForumGameSummary | null> {
    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: GAMES_TABLE,
      queries: [Query.equal('slug', slug), Query.limit(1)],
    });
    const game = result.rows[0];
    return game ? this.toGameSummary(game) : null;
  }

  private async findGameById(gameId: string): Promise<ForumGameSummary | null> {
    const game = await this.db
      .getRow<any>({
        databaseId: DB_ID,
        tableId: GAMES_TABLE,
        rowId: gameId,
      })
      .catch(() => null);
    return game ? this.toGameSummary(game) : null;
  }

  private toGameSummary(game: any): ForumGameSummary {
    return {
      $id: game.$id,
      name: game.name,
      slug: game.slug,
      coverUrl: game.coverUrl ?? null,
      releaseYear: game.releaseYear ?? null,
    };
  }

  private async fetchGamesMap(
    gameIds: string[],
    seed?: Map<string, ForumGameSummary>,
  ): Promise<Map<string, ForumGameSummary>> {
    const map = new Map<string, ForumGameSummary>(seed ?? []);
    if (!gameIds.length) return map;

    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: GAMES_TABLE,
      queries: [Query.equal('$id', gameIds), Query.limit(gameIds.length)],
    });

    for (const game of result.rows) {
      map.set(game.$id, this.toGameSummary(game));
    }

    return map;
  }

  private async fetchProfilesMap(
    rows: any[],
    profileIds: string[],
  ): Promise<Map<string, ForumAuthorSummary>> {
    const map = new Map<string, ForumAuthorSummary>();

    for (const row of rows) {
      if (
        row.userProfile &&
        typeof row.userProfile === 'object' &&
        row.userProfile.$id &&
        row.userProfile.gamertag
      ) {
        map.set(row.userProfile.$id, {
          $id: row.userProfile.$id,
          gamertag: row.userProfile.gamertag,
          avatarUrl: row.userProfile.avatarUrl ?? null,
        });
      }
    }

    const missingIds = profileIds.filter((id) => !map.has(id));
    if (!missingIds.length) return map;

    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: PROFILES_TABLE,
      queries: [Query.equal('$id', missingIds), Query.limit(missingIds.length)],
    });

    for (const profile of result.rows) {
      map.set(profile.$id, {
        $id: profile.$id,
        gamertag: profile.gamertag,
        avatarUrl: profile.avatarUrl ?? null,
      });
    }

    return map;
  }

  private async fetchViewerVotesMap(
    commentIds: string[],
    viewerUserId?: string,
  ): Promise<Map<string, 'up' | 'down'>> {
    const map = new Map<string, 'up' | 'down'>();
    if (!viewerUserId || !commentIds.length) return map;

    const result = await this.db.listRows<any>({
      databaseId: DB_ID,
      tableId: VOTES_TABLE,
      queries: [
        Query.equal('comment', commentIds),
        Query.equal('userId', viewerUserId),
        Query.limit(commentIds.length),
      ],
    });

    for (const vote of result.rows) {
      const commentId =
        typeof vote.comment === 'string' ? vote.comment : vote.comment?.$id;
      if (commentId && (vote.type === 'up' || vote.type === 'down')) {
        map.set(commentId, vote.type);
      }
    }

    return map;
  }

  private extractProfileId(userProfile: any): string | null {
    if (!userProfile) return null;
    if (typeof userProfile === 'string') return userProfile;
    return typeof userProfile.$id === 'string' ? userProfile.$id : null;
  }

  private extractParentId(row: any): string | null {
    if (!row?.parentId) return null;
    if (typeof row.parentId === 'string') return row.parentId;
    return typeof row.parentId.$id === 'string' ? row.parentId.$id : null;
  }
}
