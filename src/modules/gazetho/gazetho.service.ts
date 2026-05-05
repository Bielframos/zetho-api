import { Injectable, NotFoundException } from '@nestjs/common';
import { PostsStatus } from 'infra/appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { CreatePostDto, PopularTagsDto, SearchPostsDto } from './gazetho.dto';

type RelatedGameSummary = {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
};

@Injectable()
export class GazethoService {
  posts: Appwrite['databases']['posts'];
  authors: Appwrite['databases']['authors'];
  games: Appwrite['databases']['games'];

  constructor(private readonly appwrite: Appwrite) {
    this.posts = this.appwrite.databases.posts;
    this.authors = this.appwrite.databases.authors;
    this.games = this.appwrite.databases.games;
  }

  async createPost(dto: CreatePostDto) {
    const slug = this.slugify(dto.slug ?? dto.title);

    return await this.posts.create({
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
    });
  }

  async searchPosts(dto: SearchPostsDto) {
    const safePage = this.toPositiveInt(dto.page, 1);
    const safePageSize = this.toSafeLimit(dto.pageSize, 12, 100);
    const offset = (safePage - 1) * safePageSize;
    const term = dto.q?.trim();

    const response = await this.posts.list({
      queries: (q) => {
        const filters: string[] = [];

        if (dto.status) {
          filters.push(q.equal('status', dto.status));
        }

        if (dto.authorId) {
          filters.push(q.equal('author' as any, dto.authorId as any));
        }

        if (dto.tag?.trim()) {
          filters.push(q.contains('tags', dto.tag.trim()));
        }

        if (dto.gameId?.trim()) {
          filters.push(q.contains('relatedGameIds', dto.gameId.trim()));
        }

        if (term) {
          filters.push(
            q.or(
              q.search('title', term),
              q.search('subtitle', term),
              q.search('body', term),
              q.contains('slug', this.slugify(term)),
            ),
          );
        }

        const queries: string[] = [
          q.orderDesc('$createdAt'),
          q.limit(safePageSize),
          q.offset(offset),
        ];

        if (filters.length > 1) {
          queries.unshift(q.and(...filters));
        } else if (filters.length === 1) {
          queries.unshift(filters[0]);
        }

        return queries;
      },
    });

    return {
      items: response.rows,
      page: safePage,
      pageSize: safePageSize,
      total: response.total,
      totalPages: Math.max(1, Math.ceil(response.total / safePageSize)),
    };
  }

  async findPostBySlug(slug: string) {
    const sanitizedSlug = slug.trim();

    const response = await this.posts.list({
      queries: (q) => [
        q.equal('slug', sanitizedSlug),
        q.limit(1),
        q.select(['*, author.*'] as any),
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

      const response = await this.posts.list({
        queries: (q) => [
          q.equal('status', PostsStatus.PUBLISHED),
          q.select(['tags']),
          q.limit(pageSize),
          q.offset(offset),
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

  private async expandRelatedGames(
    relatedGameIds?: string[] | null,
  ): Promise<RelatedGameSummary[]> {
    const uniqueIds = [
      ...new Set((relatedGameIds ?? []).map((id) => id.trim())),
    ].filter(Boolean);

    if (!uniqueIds.length) {
      return [];
    }

    const gamesResponse = await this.games.list({
      queries: (q) => [
        q.equal('$id' as any, uniqueIds as any),
        q.select(['$id', 'name', 'slug', 'coverUrl'] as any),
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
