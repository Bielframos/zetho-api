import { Inject, Injectable } from '@nestjs/common';
import { GENKIT } from './ai.constants';
import { type Genkit, z } from 'genkit';
import { DOMParser } from '@xmldom/xmldom';
import { GameService } from 'src/modules/game/game.service';
import { PostsStatus, type Games } from 'infra/appwrite';
import { Appwrite } from '../appwrite/appwrite.provider';
import { ID } from 'node-appwrite';
import { YoutubeService } from 'src/modules/google/youtube.service';
import { channel } from 'node:diagnostics_channel';
import { description } from 'valibot';

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
  relatedGames: string;
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
};

const ZETHO_INSIDER_ID = '69f945e0000754418a5b';

const feedUrls = [
  'https://feeds.feedburner.com/ign/games-all',
  'https://www.gamespot.com/feeds/game-news',
  'https://blog.playstation.com/feed/',
  'https://news.xbox.com/en-us/feed/',
  'https://www.videogameschronicle.com/feed/',
];

@Injectable()
export class EditorService {
  private posts: Appwrite['databases']['posts'];

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly appwrite: Appwrite,
    private readonly youtubeService: YoutubeService,
  ) {
    this.posts = this.appwrite.databases.posts;
  }

  async execute(suggestion?: string) {
    const { posts, contents } = await this.getNews();

    const recentPosts = await this.getRecentPostsForAi();
    const analysis = await this.trendAnalysis(posts, recentPosts, suggestion);

    const postId = analysis.id as string;
    const post = posts.find((p) => p.id === postId);

    if (post) {
      let content = contents.find((c) => c.id === postId)?.content || 'N/A';

      if ((!content || content === 'N/A') && !post.description) {
        throw new Error(`Content not found for post ID: ${postId}`);
      }

      post.content = content;
    } else throw new Error('Post not found');

    const relatedGames = await this.getRelatedGames(analysis.relatedGames);

    const article = await this.writeArticle(post, relatedGames);

    const processedBody = this.postProcessContent(article.post.body);
    article.post.body = processedBody;

    const mainImage = await this.resolveMainImage(article, relatedGames);

    const savedPost = await this.saveGeneratedPost({
      article,
      fallbackMainImage: post.link,
      pickedMainImage: mainImage,
    });

    this.invalidateFrontendCache();

    return { savedPost };
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
        relatedGames: 'N/A',
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
   * @param games - Jogos relacionados à matéria.
   */
  private async writeArticle(
    post: Feed['posts'][number],
    games: Games[],
  ): Promise<AiArticle> {
    const prompt = this.ai.prompt('editor/write_article');
    const { output } = await prompt(
      { post, games },
      { tools: [this.youtubeTool] },
    );
    return output;
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
   * Obtém os posts recentes para análise pela IA.
   * @param limit
   * @returns
   */
  private async getRecentPostsForAi(limit = 20): Promise<RecentPostForAi[]> {
    const safeLimit = Math.max(1, Math.min(limit, 15));

    const response = await this.posts.list({
      queries: (q) => [
        q.equal('status', PostsStatus.PUBLISHED),
        q.select(['title', '$createdAt', 'originalSourceUrl']),
        q.orderDesc('$createdAt'),
        q.limit(safeLimit),
      ],
    });

    return response.rows
      .filter((row) => !!row.title)
      .map((row) => ({
        title: row.title,
        pubDate: row.$createdAt,
        originalSourceUrl: row.originalSourceUrl ?? '',
      }));
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
   * Resolve a imagem principal do artigo com base na estratégia definida e nos jogos relacionados.
   * @param article - Artigo gerado pela IA.
   * @param relatedGames - Jogos relacionados ao artigo.
   * @returns A imagem principal selecionada ou null se não houver necessidade.
   */
  private async resolveMainImage(
    article: AiArticle,
    relatedGames: Games[],
  ): Promise<PickedImage | null> {
    if (!article.imageStrategy.needsImage) {
      return null;
    }

    if (article.imageStrategy.type === 'game' && relatedGames.length > 0) {
      return this.pickGameScreenshot(relatedGames[0]);
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

    return this.posts.create({
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
  private async fetchRSS(url: string): Promise<Feed> {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const items = [
      ...Array.from(xml.getElementsByTagName('item')),
      ...Array.from(xml.getElementsByTagName('entry')),
    ];

    let posts: Feed['posts'] = [];
    let contents: Feed['contents'] = [];

    for (const el of items) {
      const pubDate =
        el.getElementsByTagName('pubDate')[0]?.textContent ||
        el.getElementsByTagName('published')[0]?.textContent ||
        el.getElementsByTagName('updated')[0]?.textContent ||
        '';

      const dateObj = new Date(pubDate);
      const now = new Date();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const ageMs = now.getTime() - dateObj.getTime();

      if (Number.isNaN(dateObj.getTime()) || ageMs < 0 || ageMs > oneDayMs)
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

      posts.push({ id, title, description, link, pubDate });
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
  async getNews() {
    const feeds = await Promise.all(feedUrls.map((url) => this.fetchRSS(url)));

    return feeds.reduce(
      (acc, feed) => {
        acc.posts.push(...feed.posts);
        acc.contents.push(...feed.contents);
        return acc;
      },
      { posts: [], contents: [] } as Feed,
    );
  }

  /**
   * Obtém os jogos relacionados a matéria.
   */
  private async getRelatedGames(relatedGames: string) {
    const slugs = relatedGames
      .split(',')
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);

    const results = await Promise.allSettled(
      slugs.map((slug) => this.gameService.findBySlug(slug, 'name, slug')),
    );

    return results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<Games>).value);
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
