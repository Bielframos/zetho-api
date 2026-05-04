import { Inject, Injectable } from '@nestjs/common';
import { GENKIT } from './ai.constants';
import type { Genkit } from 'genkit';
import { DOMParser } from '@xmldom/xmldom';
import { GameService } from 'src/modules/game/game.service';
import { type Games } from 'infra/appwrite';

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

const feedUrls = [
  'https://feeds.feedburner.com/ign/games-all',
  'https://www.gamespot.com/feeds/game-news',
  'https://blog.playstation.com/feed/',
  'https://news.xbox.com/en-us/feed/',
  'https://www.videogameschronicle.com/feed/',
];

@Injectable()
export class EditorService {
  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
  ) {}

  async run() {
    const { posts, contents } = await this.getNews();
    const analysis = await this.trendAnalysis(posts);

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

    return { analysis, relatedGames, article };
  }

  /**
   * Realiza a análise de tendências com base nos posts fornecidos.
   * @param posts - Lista de posts para análise.
   * @returns Análise de tendências.
   */
  private async trendAnalysis(posts: Feed['posts']) {
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
    const { output } = await prompt({ posts });
    return output;
  }

  /**
   * Realiza a redação de uma matéria com base na análise de tendências e no conteúdo do post.
   * @param post - Post para redação.
   * @param games - Jogos relacionados à matéria.
   */
  private async writeArticle(post: Feed['posts'][number], games: Games[]) {
    const prompt = this.ai.prompt('editor/write_article');
    const { output } = await prompt({ post, games });
    return output;
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

      const id = crypto.randomUUID();
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
  private async getNews() {
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
}
