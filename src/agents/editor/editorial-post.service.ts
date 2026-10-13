import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { ID, Query } from 'node-appwrite';
import { PostsStatus } from 'src/infra/appwrite/appwrite.enums';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { OutboxService } from 'src/infra/events/outbox.service';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { resolveFrontendOrigin } from 'src/common/utils/frontend-origin';
import { EditorialImageService } from './editorial-image.service';
import { generatedEditorialIssues } from './editorial-policy';

type AiArticle = {
  verification?: { supported: boolean; issues: string[] };
  post: {
    title: string;
    subtitle: string;
    slug: string;
    body: string;
    status: string;
    tags: string[];
    relatedGameIds: string[];
    seo: { title: string; description: string };
    originalSourceUrl: string;
  };
};
export type RecentEditorialPost = {
  title: string;
  pubDate: string;
  originalSourceUrl: string;
  tags: string[];
};
const MIN_BODY_CHARS = 1200;
const MIN_TITLE_CHARS = 20;

@Injectable()
export class EditorialPostService {
  private readonly logger = new Logger(EditorialPostService.name);
  private readonly tablesDB: Appwrite['tablesDB'];
  private static readonly DB_ID = 'app';

  constructor(
    appwrite: Appwrite,
    private readonly outboxService: OutboxService,
    private readonly notificationsService: NotificationsService,
    private readonly editorialImages: EditorialImageService,
  ) {
    this.tablesDB = appwrite.tablesDB;
  }

  registerPublicationHandler() {
    this.outboxService.registerHandler(
      'editorial.post.published',
      async (payload) => {
        const item = payload as {
          id?: string;
          title: string;
          subtitle: string;
          slug: string;
          mediaUrl?: string;
          relatedGameIds?: string[];
        };
        await this.notificationsService.sharePost({
          title: item.title,
          subtitle: item.subtitle,
          postUrl: new URL(
            `/noticias/${item.slug}`,
            resolveFrontendOrigin(),
          ).toString(),
          mediaUrl: item.mediaUrl,
        });
        if (item.id && item.relatedGameIds?.length) {
          try {
            await this.notificationsService.sendGameSubscriberEmails({
              postId: item.id,
              title: item.title,
              subtitle: item.subtitle,
              slug: item.slug,
              mediaUrl: item.mediaUrl,
              relatedGameIds: item.relatedGameIds,
            });
          } catch (error) {
            this.logger.error(
              `Failed to send game subscriber emails for post ${item.id}`,
              error instanceof Error ? error.stack : String(error),
            );
            throw error;
          }
        }
      },
    );
  }

  async getRecentPostsForAi(limit = 30): Promise<RecentEditorialPost[]> {
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const response = await this.tablesDB.listRows({
      databaseId: EditorialPostService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('status', PostsStatus.PUBLISHED),
        Query.greaterThan('$createdAt', cutoffDate),
        Query.select(['title', '$createdAt', 'originalSourceUrl', 'tags']),
        Query.orderDesc('$createdAt'),
        Query.limit(safeLimit),
      ],
    });
    return response.rows
      .filter((row) => !!row.title)
      .map((row) => ({
        title: row.title,
        pubDate: row.$createdAt,
        originalSourceUrl: row.originalSourceUrl ?? '',
        tags: row.tags ?? [],
      }));
  }

  async sourceUrlAlreadyPublished(sourceUrl: string): Promise<boolean> {
    const response = await this.tablesDB.listRows({
      databaseId: EditorialPostService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('originalSourceUrl', sourceUrl),
        Query.equal('status', PostsStatus.PUBLISHED),
        Query.limit(1),
      ],
    });
    return response.rows.length > 0;
  }

  postProcessContent(body: string) {
    const document = new JSDOM(`<body>${body}</body>`).window.document;
    const allowed = new Set([
      'P',
      'H2',
      'H3',
      'UL',
      'OL',
      'LI',
      'STRONG',
      'EM',
      'A',
      'BR',
    ]);
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      if (!allowed.has(element.tagName)) {
        if (
          [
            'SCRIPT',
            'STYLE',
            'IFRAME',
            'OBJECT',
            'SVG',
            'FORM',
            'TEMPLATE',
          ].includes(element.tagName)
        )
          element.remove();
        else element.replaceWith(...Array.from(element.childNodes));
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        if (
          element.tagName === 'A' &&
          attribute.name === 'href' &&
          /^https?:\/\//i.test(attribute.value)
        )
          continue;
        element.removeAttribute(attribute.name);
      }
    }
    return this.normalizeHtml(this.renderYoutube(document.body.innerHTML));
  }

  async saveGeneratedPost(article: AiArticle, fallbackSourceUrl: string) {
    const slug = this.slugify(article.post.slug || article.post.title);
    const title = article.post.title.trim();
    const originalSourceUrl = this.toNullableString(fallbackSourceUrl);
    const reasons: string[] = [];
    const bodyLength = this.toPlainText(article.post.body).length;
    if (title.length < MIN_TITLE_CHARS)
      reasons.push(
        `título com ${title.length} caracteres (mínimo ${MIN_TITLE_CHARS})`,
      );
    if (bodyLength < MIN_BODY_CHARS)
      reasons.push(
        `corpo com ${bodyLength} caracteres (mínimo ${MIN_BODY_CHARS})`,
      );
    if (!originalSourceUrl) reasons.push('sem URL de fonte original');
    if (!slug) reasons.push('slug vazio');
    else if (await this.slugAlreadyExists(slug))
      reasons.push(`slug duplicado ("${slug}")`);
    const verificationFailed = article.verification?.supported !== true;
    if (verificationFailed)
      reasons.push(
        ...(article.verification?.issues ?? [
          'verificação factual indisponível',
        ]),
      );
    reasons.push(...generatedEditorialIssues(article.post));
    const status =
      reasons.length || verificationFailed
        ? PostsStatus.DRAFT
        : PostsStatus.PUBLISHED;
    if (status === PostsStatus.DRAFT)
      this.logger.warn(
        `Post "${title}" salvo como rascunho pelo piso de qualidade: ${reasons.join('; ')}`,
      );
    const mainImage = originalSourceUrl
      ? await this.editorialImages?.forPublication(originalSourceUrl)
      : null;
    return this.tablesDB.createRow({
      databaseId: EditorialPostService.DB_ID,
      tableId: 'posts',
      rowId: ID.unique(),
      data: {
        title,
        subtitle: this.toNullableString(article.post.subtitle),
        slug,
        body: article.post.body,
        mainImage: mainImage ? JSON.stringify(mainImage) : null,
        status,
        tags: article.post.tags
          .map((tag) => this.slugify(tag))
          .filter(Boolean)
          .slice(0, 10),
        relatedGameIds: article.post.relatedGameIds
          .map((id) => this.toTrimmedString(id))
          .filter((id): id is string => Boolean(id)),
        seo: JSON.stringify({
          title: this.toTrimmedString(article.post.seo?.title) || '',
          description:
            this.toTrimmedString(article.post.seo?.description) || '',
        }),
        originalSourceUrl,
        author: process.env.EDITOR_AUTHOR_ID?.trim() || 'zetho-editor',
      },
    });
  }

  private async slugAlreadyExists(slug: string) {
    try {
      const existing = await this.tablesDB.listRows({
        databaseId: EditorialPostService.DB_ID,
        tableId: 'posts',
        queries: [Query.equal('slug', slug), Query.limit(1)],
      });
      return existing.total > 0;
    } catch (error) {
      this.logger.warn(
        `Falha ao verificar slug duplicado "${slug}": ${String(error)}`,
      );
      return false;
    }
  }
  private renderYoutube(body: string) {
    return body.replace(
      /\[youtube:([a-zA-Z0-9_-]{11})\]/g,
      (_, id) =>
        `\n        <div data-youtube-video=""><iframe width="840" height="473" src="https://www.youtube.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy" allowfullscreen></iframe></div>\n    `,
    );
  }
  private normalizeHtml(body: string) {
    return body
      .replace(/\n/g, '')
      .replace(/\t/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  private toPlainText(value?: string | null) {
    return typeof value !== 'string'
      ? ''
      : value
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
  }
  private toNullableString(value?: string | null) {
    return this.toTrimmedString(value) || null;
  }
  private toTrimmedString(value?: string | null) {
    return typeof value === 'string' ? value.trim() : '';
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
}
