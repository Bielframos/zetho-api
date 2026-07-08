import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OutboxService } from 'src/common/events/outbox.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DOMParser } from '@xmldom/xmldom';
import { z, type Genkit } from 'genkit';
import type { Games } from 'src/common/appwrite/appwrite';
import { PostsStatus } from 'src/common/appwrite/appwrite.enums';
import { ID, Query } from 'node-appwrite';
import { GameService } from 'src/modules/game/game.service';
import { YoutubeService } from 'src/modules/google/youtube.service';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { Appwrite } from '../../../appwrite/appwrite.provider';
import { GENKIT } from '../../ai.constants';
import { CorrelationContextService } from 'src/common/observability/correlation-context.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { ContentExtractorService } from './content-extractor.service';

type Feed = {
  posts: {
    id: string;
    title: string;
    description: string;
    link: string;
    pubDate: string;
    content?: string;
  }[];
  contents: {
    id: string;
    content: string;
  }[];
};

type TrendAnalysis = {
  id: string;
  title: string;
  publisher: string;
  why: string;
};

type AiArticle = {
  post: {
    title: string;
    subtitle: string;
    slug: string;
    body: string;
    status: string;
    tags: string[];
    relatedGameIds: string[];
    seo: {
      title: string;
      description: string;
    };
    originalSourceUrl: string;
  };
  imageStrategy: {
    needsImage: boolean;
    type: 'game' | 'generic';
    query?: string;
  };
};

type UnsplashImage = {
  id: string;
  url: string;
  alt: string;
  description: string;
  authorName: string;
  authorUsername: string;
};

type PickedImage = {
  url: string;
  alt: string;
  caption: string;
};

type RecentPostForAi = {
  title: string;
  pubDate: string;
  originalSourceUrl: string;
  tags: string[];
};

type NewsCaptureOptions = {
  captureWindowHours?: number;
};

type ExecuteEditorOptions = NewsCaptureOptions & {
  suggestion?: string;
};

type GenerateGuidedArticleOptions = {
  url: string;
  instructions?: string;
};

const ZETHO_INSIDER_ID = '69f945e0000754418a5b';
const DEFAULT_CAPTURE_WINDOW_HOURS = 24;
const GAZETHO_SITE_BASE_URL = 'https://ga.zetho.app';
// Limita o conteúdo extraído enviado à IA no fluxo guiado, evitando estourar
// o limite de tokens do provedor com páginas muito longas.
const GUIDED_CONTENT_MAX_CHARS = 12000;

const feedUrls = [
  'https://feeds.feedburner.com/ign/games-all',
  'https://www.gamespot.com/feeds/game-news',
  'https://blog.playstation.com/feed/',
  'https://news.xbox.com/en-us/feed/',
  'https://www.videogameschronicle.com/feed/',
];

@Injectable()
export class EditorService implements OnModuleInit {
  private readonly logger = new Logger(EditorService.name);
  private static readonly DB_ID = 'app';
  private readonly tablesDB: Appwrite['tablesDB'];
  private readonly defaultCaptureWindowHours =
    this.resolveCaptureWindowHours(
      process.env.EDITOR_NEWS_CAPTURE_WINDOW_HOURS,
    ) ?? DEFAULT_CAPTURE_WINDOW_HOURS;

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly appwrite: Appwrite,
    private readonly youtubeService: YoutubeService,
    private readonly notificationsService: NotificationsService,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly outboxService: OutboxService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  onModuleInit() {
    this.outboxService.registerHandler(
      'editorial.post.published',
      async (payload) => {
        const typedPayload = payload as {
          id?: string;
          title: string;
          subtitle: string;
          slug: string;
          mediaUrl?: string;
          relatedGameIds?: string[];
        };

        // 1. WhatsApp sharing
        await this.notificationsService.sharePost({
          title: typedPayload.title,
          subtitle: typedPayload.subtitle,
          postUrl: this.buildPostUrl(typedPayload.slug),
          mediaUrl: typedPayload.mediaUrl,
        });

        // 2. Subscriber emails
        if (
          typedPayload.id &&
          typedPayload.relatedGameIds &&
          typedPayload.relatedGameIds.length > 0
        ) {
          try {
            await this.notificationsService.sendGameSubscriberEmails({
              postId: typedPayload.id,
              title: typedPayload.title,
              subtitle: typedPayload.subtitle,
              slug: typedPayload.slug,
              relatedGameIds: typedPayload.relatedGameIds,
            });
          } catch (error) {
            this.logger.error(
              `Failed to send game subscriber emails for post ${typedPayload.id}`,
              error instanceof Error ? error.stack : String(error),
            );
            // Re-throw to trigger outbox retry
            throw error;
          }
        }

        // 3. Cache invalidation
        await this.invalidateFrontendCache();
      },
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledExecution() {
    return this.correlationContext.runWithGeneratedCorrelationId(
      () =>
        this.loggerContext.trackLifecycle(
          this.logger,
          {
            component: EditorService.name,
            operation: 'editor.cron',
          },
          async () => this.execute(),
        ),
      'cron',
    );
  }

  async execute(options: ExecuteEditorOptions = {}) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: EditorService.name,
        operation: 'editor.execute',
      },
      async () => {
        const { suggestion, captureWindowHours } = options;
        const { posts, contents } = await this.getNews({ captureWindowHours });

        const recentPosts = await this.getRecentPostsForAi();
        const postsForAnalysis = posts.slice(0, 60);
        const analysis = await this.trendAnalysis(
          postsForAnalysis,
          recentPosts,
          suggestion,
        );

        if (this.shouldSkipPublication(analysis)) {
          return {
            skipped: true as const,
            reason:
              analysis.why || 'No unpublished topic was found in the feed.',
          };
        }

        const postId = analysis.id as string;
        const post = posts.find((p) => p.id === postId);

        if (post) {
          const content =
            contents.find((c) => c.id === postId)?.content || 'N/A';

          if ((!content || content === 'N/A') && !post.description) {
            throw new Error(`Content not found for post ID: ${postId}`);
          }

          post.content = content;
        } else throw new Error('Post not found');

        if (post.link && (await this.sourceUrlAlreadyPublished(post.link))) {
          return {
            skipped: true as const,
            reason: `Source URL already published: ${post.link}`,
          };
        }

        const article = await this.writeArticle(post);

        const processedBody = this.postProcessContent(article.post.body);
        article.post.body = processedBody;

        const mainImage = await this.resolveMainImage(article);

        const savedPost = await this.saveGeneratedPost({
          article,
          fallbackMainImage: post.link,
          pickedMainImage: mainImage,
        });

        await this.outboxService.enqueueImmediate({
          type: 'editorial.post.published',
          payload: {
            id: savedPost.$id,
            title: savedPost.title,
            subtitle: savedPost.subtitle ?? '',
            slug: savedPost.slug,
            mediaUrl: mainImage?.url,
            relatedGameIds: savedPost.relatedGameIds || [],
          },
        });

        return { skipped: false as const, savedPost };
      },
    );
  }

  async generateGuidedArticle(options: GenerateGuidedArticleOptions) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: EditorService.name,
        operation: 'editor.generateGuided',
      },
      async () => {
        const { url, instructions } = options;

        if (await this.sourceUrlAlreadyPublished(url)) {
          return {
            skipped: true as const,
            reason: `Source URL already published: ${url}`,
          };
        }

        const { title, text } = await this.contentExtractor.extract(url);

        const post: Feed['posts'][number] = {
          id: ID.unique(),
          title,
          description: text.slice(0, 500),
          link: url,
          pubDate: new Date().toISOString(),
          content: text.slice(0, GUIDED_CONTENT_MAX_CHARS),
        };

        const article = await this.writeArticle(post, {
          humanInstructions: instructions,
        });

        article.post.body = this.postProcessContent(article.post.body);

        const mainImage = await this.resolveMainImage(article);

        const savedPost = await this.saveGeneratedPost({
          article,
          fallbackMainImage: url,
          pickedMainImage: mainImage,
        });

        await this.outboxService.enqueueImmediate({
          type: 'editorial.post.published',
          payload: {
            id: savedPost.$id,
            title: savedPost.title,
            subtitle: savedPost.subtitle ?? '',
            slug: savedPost.slug,
            mediaUrl: mainImage?.url,
            relatedGameIds: savedPost.relatedGameIds || [],
          },
        });

        return { skipped: false as const, savedPost };
      },
    );
  }

  /**
   * Realiza a análise de tendências com base nos posts fornecidos.
   * @param posts - Lista de posts para análise.
   * @returns Análise de tendências.
   */
  private async trendAnalysis(
    posts: Feed['posts'],
    recentPosts: RecentPostForAi[],
    humanSuggestion?: string,
  ) {
    if (posts.length === 0) {
      return {
        id: 'N/A',
        title: 'N/A',
        publisher: 'N/A',
        why: 'No posts were provided for analysis.',
      } satisfies TrendAnalysis;
    }

    const prompt = this.ai.prompt('editor/trend_analysis');
    const { output } = await prompt({ humanSuggestion, posts, recentPosts });
    return output;
  }

  /**
   * Realiza a redação de uma matéria com base na análise de tendências e no conteúdo do post.
   * @param post - Post para redação.
   * @param options - Opções adicionais para redação.
   */
  private async writeArticle(
    post: Feed['posts'][number],
    options: { humanInstructions?: string } = {},
  ): Promise<AiArticle> {
    const prompt = this.ai.prompt('editor/write_article');
    const { output } = await prompt(
      { post, humanInstructions: options.humanInstructions },
      { tools: [this.youtubeTool, this.gameSearchTool] },
    );
    return output;
  }

  /**
   * Verifica se a publicação deve ser ignorada com base na análise de tendências.
   * @param analysis
   * @returns
   */
  private shouldSkipPublication(analysis: TrendAnalysis) {
    return [analysis.id, analysis.title]
      .map((value) => this.toTrimmedString(value))
      .some((value) => value.toUpperCase() === 'N/A');
  }

  /**
   * Usa a IA para selecionar a imagem mais adequada ao post dentre as imagens do Unsplash.
   * @param images - Array de imagens do Unsplash.
   * @returns A imagem selecionada pela IA.
   */
  private async pickImage(images: UnsplashImage[]): Promise<PickedImage> {
    const prompt = this.ai.prompt('editor/pick_image');
    const { output } = await prompt({ images });
    return output;
  }

  /**
   * Define a ferramenta de pesquisa de vídeos do YouTube para ser usada pela IA durante a redação do artigo.
   */
  private get youtubeTool() {
    return this.ai.defineTool(
      {
        name: 'youtubeTool',
        description: 'Pesquisa por vídeos no youtube.',
        inputSchema: z.object({ query: z.string() }),
        outputSchema: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            channel: z.string(),
            description: z.string(),
          }),
        ),
      },
      async (input) => {
        const { query } = input;
        const results = await this.youtubeService.searchVideos(query);
        return results || [];
      },
    );
  }

  /**
   * Tool que permite ao agente de redação buscar jogos no catálogo Zetho
   * para vinculá-los ao artigo. O agente deve conferir name/slug antes de
   * usar o $id retornado.
   */
  private get gameSearchTool() {
    return this.ai.defineTool(
      {
        name: 'gameSearchTool',
        description:
          'Busca jogos no catálogo Zetho por nome para vincular ao artigo. Retorna $id, name e slug.',
        inputSchema: z.object({ query: z.string() }),
        outputSchema: z.array(
          z.object({
            $id: z.string(),
            name: z.string(),
            slug: z.string(),
          }),
        ),
      },
      async (input) => {
        const { query } = input;
        const { results } = await this.gameService.search({
          q: query,
          pageSize: 5,
        });
        return results.map((game) => ({
          $id: game.$id,
          name: game.name,
          slug: game.slug,
        }));
      },
    );
  }

  /**
   * Obtém os posts recentes para análise pela IA.
   * @param limit
   * @returns
   */
  private async getRecentPostsForAi(limit = 30): Promise<RecentPostForAi[]> {
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const response = await this.tablesDB.listRows({
      databaseId: EditorService.DB_ID,
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

  private async sourceUrlAlreadyPublished(sourceUrl: string): Promise<boolean> {
    const response = await this.tablesDB.listRows({
      databaseId: EditorService.DB_ID,
      tableId: 'posts',
      queries: [
        Query.equal('originalSourceUrl', sourceUrl),
        Query.equal('status', PostsStatus.PUBLISHED),
        Query.limit(1),
      ],
    });
    return response.rows.length > 0;
  }

  /**
   * Realiza o pós-processamento do conteúdo gerado pela IA, como limpeza de HTML, formatação ou adição de elementos necessários para a publicação.
   */
  private postProcessContent(body: string) {
    let processed = body;

    const processes = [this.renderYoutube, this.normalizeHtml];

    for (const process of processes) {
      processed = process.call(this, processed);
    }

    return processed;
  }

  /**
   * Substitui os placeholders de vídeos do YouTube no conteúdo pelo HTML correspondente.
   * @param body - Conteúdo contendo os placeholders de vídeos do YouTube.
   * @returns Conteúdo com os vídeos do YouTube incorporados.
   */
  private renderYoutube(body: string) {
    return body.replace(
      /\[youtube:([a-zA-Z0-9_-]{11})\]/g,
      (_, id) => `
        <div data-youtube-video=""><iframe width="840" height="473" src="https://www.youtube.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy" allowfullscreen></iframe></div>
    `,
    );
  }

  /**
   * Normaliza o HTML removendo quebras de linha, tabs e espaços extras.
   * @param body - Conteúdo HTML a ser normalizado.
   * @returns Conteúdo HTML normalizado.
   */
  private normalizeHtml(body: string) {
    return body
      .replace(/\n/g, '')
      .replace(/\t/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Resolve a imagem principal do artigo com base na estratégia definida.
   * @param article - Artigo gerado pela IA.
   * @returns A imagem principal selecionada ou null se não houver necessidade.
   */
  private async resolveMainImage(
    article: AiArticle,
  ): Promise<PickedImage | null> {
    if (!article.imageStrategy.needsImage) {
      return null;
    }

    if (article.imageStrategy.type === 'game') {
      const gameId = article.post.relatedGameIds[0];
      if (gameId) {
        try {
          const game = await this.gameService.findById(gameId, 'name,slug');
          return await this.pickGameScreenshot(game);
        } catch (error) {
          this.logger.warn(
            `Falha ao resolver imagem do jogo ${gameId}; usando fallback. ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        this.logger.warn(
          'imageStrategy.type=game mas relatedGameIds está vazio; usando fallback.',
        );
      }
    }

    if (article.imageStrategy.query) {
      const images = await this.searchUnsplash(article.imageStrategy.query);
      return images.length > 0 ? this.pickImage(images) : null;
    }

    return null;
  }

  /**
   * Salva o post gerado pela IA no banco de dados.
   * @param param0 - Objeto contendo o artigo gerado, a imagem principal escolhida e a imagem principal de fallback.
   * @returns O post salvo.
   */
  private async saveGeneratedPost({
    article,
    pickedMainImage,
    fallbackMainImage,
  }: {
    article: AiArticle;
    pickedMainImage: PickedImage | null;
    fallbackMainImage: string;
  }) {
    const slug = this.slugify(article.post.slug || article.post.title);
    const title = article.post.title.trim();

    const mainImage = pickedMainImage ? JSON.stringify(pickedMainImage) : null;

    return this.tablesDB.createRow({
      databaseId: EditorService.DB_ID,
      tableId: 'posts',
      rowId: ID.unique(),
      data: {
        title,
        subtitle: this.toNullableString(article.post.subtitle),
        slug,
        body: article.post.body,
        mainImage: String(mainImage),
        status: PostsStatus.PUBLISHED,
        tags: article.post.tags
          .map((tag) => this.slugify(tag))
          .filter(Boolean)
          .slice(0, 10),
        relatedGameIds: article.post.relatedGameIds
          .map((id) => this.toTrimmedString(id))
          .filter((id): id is string => Boolean(id)),
        seo: this.buildSeoString(article.post.seo),
        originalSourceUrl:
          this.toNullableString(article.post.originalSourceUrl) ||
          this.toNullableString(fallbackMainImage),
        author: ZETHO_INSIDER_ID,
      },
    });
  }

  /**
   * Constrói a string de SEO a partir dos dados fornecidos, garantindo que os campos sejam adequadamente formatados e limitados.
   */
  private buildSeoString(value: AiArticle['post']['seo']) {
    return JSON.stringify({
      title: this.toTrimmedString(value?.title) || '',
      description: this.toTrimmedString(value?.description) || '',
    });
  }

  /**
   * Converte uma string para null se ela for vazia ou composta apenas por espaços, caso contrário, retorna a string original sem espaços nas extremidades.
   */
  private toNullableString(value?: string | null) {
    const normalized = this.toTrimmedString(value);
    return normalized || null;
  }

  /**
   * Remove espaços extras de uma string e retorna a versão limpa. Se a entrada não for uma string, retorna uma string vazia.
   */
  private toTrimmedString(value?: string | null) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim();
  }

  /**
   * Converte uma string em um slug, removendo acentos, caracteres especiais e espaços, e limitando o comprimento.
   * @param value - A string a ser convertida em slug.
   * @returns O slug gerado.
   */
  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
  }

  /**
   * Busca e processa o feed RSS, retornando apenas os posts publicados hoje.
   */
  private async fetchRSS(
    url: string,
    captureWindowHours: number,
  ): Promise<Feed> {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const items = [
      ...Array.from(xml.getElementsByTagName('item')),
      ...Array.from(xml.getElementsByTagName('entry')),
    ];

    let posts: Feed['posts'] = [];
    const contents: Feed['contents'] = [];

    for (const el of items) {
      const pubDate =
        el.getElementsByTagName('pubDate')[0]?.textContent ||
        el.getElementsByTagName('published')[0]?.textContent ||
        el.getElementsByTagName('updated')[0]?.textContent ||
        '';

      const dateObj = new Date(pubDate);
      const now = new Date();
      const captureWindowMs = captureWindowHours * 60 * 60 * 1000;
      const ageMs = now.getTime() - dateObj.getTime();

      if (
        Number.isNaN(dateObj.getTime()) ||
        ageMs < 0 ||
        ageMs > captureWindowMs
      )
        continue;

      const id = ID.unique();
      const title = el.getElementsByTagName('title')[0]?.textContent || '';
      const link =
        el.getElementsByTagName('link')[0]?.textContent ||
        el.getElementsByTagName('link')[0]?.getAttribute('href') ||
        '';
      const description =
        el.getElementsByTagName('description')[0]?.textContent ||
        el.getElementsByTagName('content')[0]?.textContent ||
        '';
      const content =
        el.getElementsByTagName('content:encoded')[0]?.textContent ||
        el.getElementsByTagName('content')[0]?.textContent ||
        '';

      posts.push({
        id,
        title,
        description: description.slice(0, 500),
        link,
        pubDate,
      });
      contents.push({ id, content });
    }

    posts = posts.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );

    return { posts, contents };
  }

  /**
   * BUsca as notícias dos feeds RSS e retorna apenas os posts publicados hoje, juntamente com seus conteúdos.
   */
  async getNews(options: NewsCaptureOptions = {}) {
    const captureWindowHours = this.getCaptureWindowHours(options);
    const feeds = await Promise.all(
      feedUrls.map((url) => this.fetchRSS(url, captureWindowHours)),
    );

    return feeds.reduce(
      (acc, feed) => {
        acc.posts.push(...feed.posts);
        acc.contents.push(...feed.contents);
        return acc;
      },
      { posts: [], contents: [] } as Feed,
    );
  }

  private getCaptureWindowHours(options?: NewsCaptureOptions) {
    return (
      this.resolveCaptureWindowHours(options?.captureWindowHours) ??
      this.defaultCaptureWindowHours
    );
  }

  private resolveCaptureWindowHours(value?: number | string | null) {
    const numericValue =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }

    return Math.min(numericValue, 24 * 30);
  }

  private buildPostUrl(slug: string) {
    return new URL(`/posts/${slug}`, GAZETHO_SITE_BASE_URL).toString();
  }

  /**
   * Busca até 10 imagens no Unsplash com base em um termo.
   */
  private async searchUnsplash(query: string): Promise<UnsplashImage[]> {
    const url = new URL('https://api.unsplash.com/search/photos');

    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch images from Unsplash: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data = (await response.json()) as {
      results: {
        id: string;
        urls: { regular: string };
        alt_description: string | null;
        description: string | null;
        user: { name: string; username: string };
      }[];
    };

    return data.results.map((img) => ({
      id: img.id,
      url: img.urls.regular,
      alt: img.alt_description ?? '',
      description: img.description ?? img.alt_description ?? '',
      authorName: img.user.name,
      authorUsername: img.user.username,
    }));
  }

  /**
   * Busca um screenshot aleatório de um jogo no Zetho.
   */
  private async pickGameScreenshot(game: Games): Promise<PickedImage | null> {
    const media = await this.gameService.getRandomScreenshot(game.$id);

    return {
      url: media,
      alt: `Captura de tela do jogo: ${game.name}`,
      caption: `Captura de tela do jogo: ${game.name}`,
    };
  }

  /**
   * Invalida o cache do Frontend do Gazetho
   */
  private async invalidateFrontendCache() {
    fetch('https://ga.zetho.app/api/revalidate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FRONTEND_REVALIDATE_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tag: 'posts' }),
    });
  }
}
