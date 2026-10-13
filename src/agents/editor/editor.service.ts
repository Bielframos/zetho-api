import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OutboxService } from 'src/infra/events/outbox.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { z, type Genkit } from 'genkit';
import { ID } from 'node-appwrite';
import { GameService } from 'src/modules/game/game.service';
import { YoutubeService } from 'src/modules/google/youtube.service';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { CorrelationContextService } from 'src/common/observability/correlation-context.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import {
  obviousEditorialRejection,
  normalizeEditorialDecision,
  type EditorialCandidate,
  type EditorialDecision,
} from './editorial-policy';
import { ContentExtractorService } from './content-extractor.service';
import {
  EditorialFeedService,
  type EditorialFeed,
  type NewsCaptureOptions,
} from './editorial-feed.service';
import {
  EditorialPostService,
  type RecentEditorialPost,
} from './editorial-post.service';
import { resolveFrontendOrigin } from 'src/common/utils/frontend-origin';

type Feed = EditorialFeed;

type TrendAnalysis = {
  id: string;
  title: string;
  publisher: string;
  why: string;
};

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
    seo: {
      title: string;
      description: string;
    };
    originalSourceUrl: string;
  };
};

type RecentPostForAi = RecentEditorialPost;

type ExecuteEditorOptions = NewsCaptureOptions & {
  suggestion?: string;
};

type GenerateGuidedArticleOptions = {
  url: string;
  instructions?: string;
};

// Limita o conteúdo extraído enviado à IA no fluxo guiado, evitando estourar
// o limite de tokens do provedor com páginas muito longas.
const GUIDED_CONTENT_MAX_CHARS = 12000;

@Injectable()
export class EditorService implements OnModuleInit {
  private readonly logger = new Logger(EditorService.name);

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly youtubeService: YoutubeService,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly outboxService: OutboxService,
    private readonly editorialFeed: EditorialFeedService,
    private readonly editorialPost: EditorialPostService,
  ) {}

  onModuleInit() {
    this.editorialPost.registerPublicationHandler();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledExecution() {
    if (!this.hasAiCredentials()) {
      this.logger.warn(
        'Skipping editorial schedule: OPENAI_KEY is not configured.',
      );
      return {
        skipped: true as const,
        reason: 'AI integration is not configured.',
      };
    }

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
        this.assertAiAvailable();
        const { suggestion, captureWindowHours } = options;
        const { posts, contents } = await this.getNews({ captureWindowHours });

        const recentPosts = await this.editorialPost.getRecentPostsForAi();
        const postsForAnalysis = posts
          .filter((post) => {
            const decision = obviousEditorialRejection(post);
            if (decision) this.logEditorialDecision(post, decision);
            return !decision;
          })
          .slice(0, 60);
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
        const post = postsForAnalysis.find((p) => p.id === postId);

        if (post) {
          const content =
            contents.find((c) => c.id === postId)?.content || 'N/A';

          if ((!content || content === 'N/A') && !post.description) {
            throw new Error(`Content not found for post ID: ${postId}`);
          }

          post.content = content;
        } else throw new Error('Post not found');

        if (
          post.link &&
          (await this.editorialPost.sourceUrlAlreadyPublished(post.link))
        ) {
          return {
            skipped: true as const,
            reason: `Source URL already published: ${post.link}`,
          };
        }

        const decision = await this.assessEligibility(post);
        if (!decision.eligible)
          return { skipped: true as const, reason: decision.reason };
        const article = await this.writeArticle(post);

        const processedBody = this.editorialPost.postProcessContent(
          article.post.body,
        );
        article.post.body = processedBody;

        const savedPost = await this.editorialPost.saveGeneratedPost(
          article,
          post.link,
        );

        // Rascunho retido pelo piso de qualidade não é publicação: não pode
        // disparar compartilhamento no WhatsApp nem e-mail para inscritos.
        if (savedPost.status === 'published') {
          await this.outboxService.enqueueImmediate({
            type: 'editorial.post.published',
            payload: {
              id: savedPost.$id,
              title: savedPost.title,
              subtitle: savedPost.subtitle ?? '',
              slug: savedPost.slug,
              relatedGameIds: savedPost.relatedGameIds || [],
            },
          });
        }

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
        this.assertAiAvailable();
        const { url, instructions } = options;

        if (await this.editorialPost.sourceUrlAlreadyPublished(url)) {
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

        const decision = await this.assessEligibility(post);
        if (!decision.eligible)
          return { skipped: true as const, reason: decision.reason };
        // Guided URLs obey the same event-level deduplication as automated capture.
        const analysis = await this.trendAnalysis(
          [post],
          await this.editorialPost.getRecentPostsForAi(),
        );
        if (this.shouldSkipPublication(analysis))
          return { skipped: true as const, reason: analysis.why };
        const article = await this.writeArticle(post, {
          humanInstructions: instructions,
        });

        article.post.body = this.editorialPost.postProcessContent(
          article.post.body,
        );

        const savedPost = await this.editorialPost.saveGeneratedPost(
          article,
          url,
        );

        // Mesma regra do fluxo automático: rascunho não dispara divulgação.
        if (savedPost.status === 'published') {
          await this.outboxService.enqueueImmediate({
            type: 'editorial.post.published',
            payload: {
              id: savedPost.$id,
              title: savedPost.title,
              subtitle: savedPost.subtitle ?? '',
              slug: savedPost.slug,
              relatedGameIds: savedPost.relatedGameIds || [],
            },
          });
        }

        return { skipped: false as const, savedPost };
      },
    );
  }

  private logEditorialDecision(
    post: EditorialCandidate,
    decision: EditorialDecision,
  ) {
    this.logger.log({
      event: 'editorial.eligibility',
      source: post.link,
      ...decision,
    });
  }

  private hasAiCredentials(): boolean {
    return Boolean(process.env.OPENAI_KEY?.trim());
  }

  private assertAiAvailable(): void {
    if (!this.hasAiCredentials()) {
      throw new ServiceUnavailableException(
        'Editorial generation is unavailable because the OpenAI integration is not configured.',
      );
    }
  }

  async assessEligibility(
    post: EditorialCandidate,
  ): Promise<EditorialDecision> {
    const obvious = obviousEditorialRejection(post);
    const decision =
      obvious ??
      (
        await this.ai.prompt('editor/eligibility')({
          post: {
            ...post,
            content: post.content?.slice(0, GUIDED_CONTENT_MAX_CHARS),
          },
        })
      ).output;
    const checked = normalizeEditorialDecision(decision);
    this.logEditorialDecision(post, checked);
    return checked;
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
      {
        post,
        humanInstructions: options.humanInstructions,
        frontendOrigin: resolveFrontendOrigin(),
      },
      { tools: [this.youtubeTool, this.gameSearchTool] },
    );
    const verification = await this.ai.prompt('editor/verify_article')({
      source: post,
      article: {
        title: output.post.title,
        subtitle: output.post.subtitle,
        body: output.post.body,
      },
    });
    return { ...output, verification: verification.output };
  }

  /**
   * Verifica se a publicação deve ser ignorada com base na análise de tendências.
   * @param analysis
   * @returns
   */
  private shouldSkipPublication(analysis: TrendAnalysis) {
    return [analysis.id, analysis.title]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .some((value) => value.toUpperCase() === 'N/A');
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

  async getNews(options: NewsCaptureOptions = {}) {
    return this.editorialFeed.getNews(options);
  }
}
