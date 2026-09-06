import { Injectable, NotFoundException } from '@nestjs/common';
import { PostsStatus } from 'src/infra/appwrite/appwrite.enums';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import {
  CreatePostDto,
  PopularTagsDto,
  PublicNewsDto,
  SearchPostsDto,
  SitemapPostsDto,
} from './gazetho.dto';

type RelatedGameSummary = {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
};

@Injectable()
export class GazethoService {
  private static readonly DB_ID = 'app';
  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(private readonly appwrite: Appwrite) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async createPost(dto: CreatePostDto) {
    const slug = this.slugify(dto.slug ?? dto.title);

    return await this.tablesDB.createRow({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      rowId: ID.unique(),
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        slug,
        body: dto.body,
        mainImage: dto.mainImage?.trim() || null,
        status: dto.status ?? PostsStatus.DRAFT,
        tags: dto.tags?.map((tag) => tag.trim()).filter(Boolean) || null,
        relatedGameIds:
          dto.relatedGameIds?.map((gameId) => gameId.trim()).filter(Boolean) ||
          null,
        seo: dto.seo?.trim() || null,
        originalSourceUrl: dto.originalSourceUrl?.trim() || null,
        author: dto.authorId,
      },
    });
  }

  async searchPosts(dto: SearchPostsDto): Promise<{
    items: Array<Record<string, unknown>>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const safePage = this.toPositiveInt(dto.page, 1);
    const safePageSize = this.toSafeLimit(dto.pageSize, 12, 100);
    const offset = (safePage - 1) * safePageSize;
    const term = dto.q?.trim();

    const filters: string[] = [];

    if (dto.status) {
      filters.push(Query.equal('status', dto.status));
    }

    if (dto.authorId) {
      filters.push(Query.equal('author' as any, dto.authorId as any));
    }

    if (dto.tag?.trim()) {
      filters.push(Query.contains('tags', dto.tag.trim()));
    }

    if (dto.gameId?.trim()) {
      filters.push(Query.contains('relatedGameIds', dto.gameId.trim()));
    }

    if (term) {
      filters.push(
        Query.or([
          Query.search('title', term),
          Query.search('subtitle', term),
          Query.search('body', term),
          Query.contains('slug', this.slugify(term)),
        ]),
      );
    }

    const queries: string[] = [
      Query.orderDesc('$createdAt'),
      Query.limit(safePageSize),
      Query.offset(offset),
      Query.select([
        '$id',
        'title',
        'subtitle',
        'slug',
        'status',
        'tags',
        'mainImage',
        'author.name',
        'author.avatarUrl',
      ] as any),
    ];

    if (filters.length > 1) {
      queries.unshift(Query.and(filters));
    } else if (filters.length === 1) {
      queries.unshift(filters[0]);
    }

    const response = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      queries,
    });

    const parsedPosts = response.rows.map((row) => {
      const { mainImage, ...post } = row;
      return {
        ...post,
        mainImage: mainImage ? JSON.parse(mainImage) : null,
      };
    });

    return {
      items: parsedPosts,
      page: safePage,
      pageSize: safePageSize,
      total: response.total,
      totalPages: Math.max(1, Math.ceil(response.total / safePageSize)),
    };
  }

  async findPostBySlug(slug: string): Promise<Record<string, unknown>> {
    const sanitizedSlug = slug.trim();

    const response = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('slug', sanitizedSlug),
        Query.limit(1),
        Query.select(['*', 'author.*'] as any),
      ],
    });

    const post = response.rows[0];

    if (!post) {
      throw new NotFoundException(
        `Post com slug "${sanitizedSlug}" não encontrado`,
      );
    }

    const relatedGames = await this.expandRelatedGames(post.relatedGameIds);

    return {
      ...post,
      mainImage: post.mainImage ? JSON.parse(post.mainImage) : null,
      relatedGames,
    };
  }

  async listPublishedNews(dto: PublicNewsDto) {
    const page = this.toPositiveInt(dto.page, 1);
    const pageSize = this.toSafeLimit(dto.pageSize, 20, 50);
    const filters = [Query.equal('status', PostsStatus.PUBLISHED)];

    if (dto.gameId?.trim()) {
      filters.push(Query.contains('relatedGameIds', dto.gameId.trim()));
    }

    const filterQuery = filters.length > 1 ? Query.and(filters) : filters[0];

    const response = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      queries: [
        filterQuery,
        Query.orderDesc('$createdAt'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
        Query.select([
          '$id',
          '$createdAt',
          '$updatedAt',
          'title',
          'subtitle',
          'slug',
          'tags',
          'author.name',
        ] as any),
      ],
    });

    return {
      items: response.rows.map((post) => this.toNewsSummary(post)),
      page,
      pageSize,
      total: response.total,
      hasMore: page * pageSize < response.total,
    };
  }

  async findPublishedNewsBySlug(slug: string) {
    const response = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('slug', slug.trim()),
        Query.equal('status', PostsStatus.PUBLISHED),
        Query.limit(1),
        Query.select([
          '$id',
          '$createdAt',
          '$updatedAt',
          'title',
          'subtitle',
          'slug',
          'body',
          'tags',
          'originalSourceUrl',
          'author.name',
          'relatedGameIds',
        ] as any),
      ],
    });
    const post = response.rows[0];
    if (!post) {
      throw new NotFoundException(`Notícia com slug "${slug}" não encontrada`);
    }

    return {
      ...this.toNewsSummary(post),
      body: post.body,
      originalSourceUrl: post.originalSourceUrl ?? null,
      relatedGames: await this.expandRelatedGames(post.relatedGameIds),
    };
  }

  private toNewsSummary(post: Record<string, any>) {
    return {
      $id: post.$id,
      $createdAt: post.$createdAt,
      $updatedAt: post.$updatedAt,
      title: post.title,
      subtitle: post.subtitle ?? null,
      slug: post.slug,
      tags: post.tags ?? [],
      author: post.author?.name ? { name: post.author.name } : null,
    };
  }

  async getPopularTags(dto: PopularTagsDto) {
    const safeLimit = this.toSafeLimit(dto.limit, 10, 50);
    const tagCounter = new Map<string, number>();

    const pageSize = 100;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const offset = (page - 1) * pageSize;

      const response = await this.tablesDB.listRows({
        databaseId: GazethoService.DB_ID,
        tableId: 'posts',
        queries: [
          Query.equal('status', PostsStatus.PUBLISHED),
          Query.select(['tags']),
          Query.limit(pageSize),
          Query.offset(offset),
        ],
      });

      totalPages = Math.max(1, Math.ceil(response.total / pageSize));

      for (const row of response.rows) {
        const tags = row.tags ?? [];

        for (const rawTag of tags) {
          const tag = rawTag.trim();
          if (!tag) continue;

          tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + 1);
        }
      }

      page += 1;
    }

    const items = [...tagCounter.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }

        return a[0].localeCompare(b[0], 'pt-BR');
      })
      .slice(0, safeLimit)
      .map(([tag, count]) => ({
        tag,
        count,
      }));

    return {
      items,
      totalUniqueTags: tagCounter.size,
      limit: safeLimit,
    };
  }

  async getPostsForSitemap(dto: SitemapPostsDto) {
    const safePage = this.toPositiveInt(dto.page, 1);
    const safePageSize = this.toSafeLimit(dto.pageSize, 5000, 5000);
    const offset = (safePage - 1) * safePageSize;
    const maxRows = 5000;

    const response = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('status', PostsStatus.PUBLISHED),
        Query.select([
          '$id',
          'title',
          'slug',
          '$createdAt',
          '$updatedAt',
        ] as any),
        Query.orderDesc('$createdAt'),
        Query.limit(safePageSize),
        Query.offset(offset),
      ],
    });

    const items = response.rows.map((row) => ({
      id: row.$id,
      title: row.title,
      slug: row.slug,
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
    }));

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total: response.total,
      totalPages: Math.max(1, Math.ceil(response.total / safePageSize)),
      maxLimit: maxRows,
      hasMore: response.total >= maxRows,
    };
  }

  private async expandRelatedGames(
    relatedGameIds?: string[] | null,
  ): Promise<RelatedGameSummary[]> {
    const uniqueIds = [
      ...new Set((relatedGameIds ?? []).map((id) => id.trim())),
    ].filter(Boolean);

    if (!uniqueIds.length) {
      return [];
    }

    const gamesResponse = await this.tablesDB.listRows({
      databaseId: GazethoService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('$id' as any, uniqueIds as any),
        Query.select(['$id', 'name', 'slug', 'coverUrl'] as any),
      ],
    });

    const byId = new Map(
      gamesResponse.rows.map((game) => [
        game.$id,
        {
          id: game.$id,
          name: game.name,
          slug: game.slug,
          coverUrl: game.coverUrl ?? null,
        },
      ]),
    );

    return uniqueIds
      .map((id) => byId.get(id))
      .filter((game): game is RelatedGameSummary => Boolean(game));
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
  }

  private toPositiveInt(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    const parsed = Math.trunc(value as number);
    if (parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private toSafeLimit(
    value: number | undefined,
    fallback: number,
    max: number,
  ) {
    const parsed = this.toPositiveInt(value, fallback);
    return Math.min(parsed, max);
  }

  async getCommunityHighlights(page: number = 1, pageSize: number = 12) {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 50));

    const ratingsResponse = await this.tablesDB.listRows<any>({
      databaseId: GazethoService.DB_ID,
      tableId: 'ratings',
      queries: [
        Query.greaterThanEqual('$createdAt', fourteenDaysAgo.toISOString()),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });

    const commentsResponse = await this.tablesDB.listRows<any>({
      databaseId: GazethoService.DB_ID,
      tableId: 'game_comments',
      queries: [
        Query.greaterThanEqual('$createdAt', fourteenDaysAgo.toISOString()),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });

    const allItems = [
      ...ratingsResponse.rows.map((r) => ({ ...r, _highlightType: 'rating' })),
      ...commentsResponse.rows.map((c) => ({
        ...c,
        _highlightType: 'comment',
      })),
    ].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    const total = allItems.length;
    const start = (safePage - 1) * safePageSize;
    const paginatedItems = allItems.slice(start, start + safePageSize);

    const fingerprints = Array.from(
      new Set(
        paginatedItems
          .filter((i) => i._highlightType === 'rating')
          .map((r) => r.ownerFingerprint)
          .filter(Boolean),
      ),
    );

    const profileMap = new Map<string, any>();
    if (fingerprints.length > 0) {
      const profilesResult = await this.tablesDB.listRows<any>({
        databaseId: GazethoService.DB_ID,
        tableId: 'user_profiles',
        queries: [
          Query.equal('fingerprint', fingerprints),
          Query.limit(fingerprints.length),
        ],
      });
      for (const p of profilesResult.rows) {
        profileMap.set(p.fingerprint, p);
      }
    }

    const profileIds = Array.from(
      new Set(
        paginatedItems
          .filter((i) => i._highlightType === 'comment')
          .map((c) =>
            typeof c.userProfile === 'string'
              ? c.userProfile
              : c.userProfile?.$id,
          )
          .filter(Boolean),
      ),
    );

    const profileIdMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const profilesByIdResult = await this.tablesDB.listRows<any>({
        databaseId: GazethoService.DB_ID,
        tableId: 'user_profiles',
        queries: [
          Query.equal('$id', profileIds),
          Query.limit(profileIds.length),
        ],
      });
      for (const p of profilesByIdResult.rows) {
        profileIdMap.set(p.$id, p);
      }
    }

    const gameIds = Array.from(
      new Set(paginatedItems.map((h) => h.gameId).filter(Boolean)),
    );
    const gameMap = new Map<string, any>();
    if (gameIds.length > 0) {
      const gamesResult = await this.tablesDB.listRows<any>({
        databaseId: GazethoService.DB_ID,
        tableId: 'games',
        queries: [
          Query.equal('$id', gameIds as string[]),
          Query.limit(gameIds.length),
        ],
      });
      for (const g of gamesResult.rows) {
        gameMap.set(g.$id, {
          name: g.name,
          slug: g.slug,
          coverUrl: g.coverUrl,
        });
      }
    }

    const assembledItems = paginatedItems.map((item) => {
      let userProfile: any = null;
      if (item._highlightType === 'rating') {
        const p = profileMap.get(item.ownerFingerprint);
        userProfile = p
          ? { gamertag: p.gamertag, avatarUrl: p.avatarUrl }
          : null;
      } else {
        const pId =
          typeof item.userProfile === 'string'
            ? item.userProfile
            : item.userProfile?.$id;
        const p = pId ? profileIdMap.get(pId) : null;
        userProfile = p
          ? { gamertag: p.gamertag, avatarUrl: p.avatarUrl }
          : null;
      }

      return {
        ...item,
        userProfile,
        game: item.gameId ? gameMap.get(item.gameId) || null : null,
      };
    });

    return {
      items: assembledItems,
      hasMore: start + safePageSize < total,
    };
  }
}
