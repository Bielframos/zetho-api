import { Injectable, NotFoundException } from '@nestjs/common';
import { PostsStatus } from 'infra/appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { CreatePostDto, SearchPostsDto } from './gazetho.dto';

@Injectable()
export class GazethoService {
  posts: Appwrite['databases']['posts'];
  authors: Appwrite['databases']['authors'];

  constructor(private readonly appwrite: Appwrite) {
    this.posts = this.appwrite.databases.posts;
    this.authors = this.appwrite.databases.authors;
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
