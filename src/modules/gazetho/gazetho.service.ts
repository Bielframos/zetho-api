import { Injectable, NotFoundException } from '@nestjs/common';
import { PostsStatus } from 'src/common/appwrite/appwrite.enums';
import { ID, Query } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import {
  CreatePostDto,
  PopularTagsDto,
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
        mainImage: dto.mainImage,
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
}
