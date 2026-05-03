import { Inject, Injectable } from '@nestjs/common';
import { GENKIT } from './ai.constants';
import type { Genkit } from 'genkit';
import { DOMParser } from '@xmldom/xmldom';

type Feed = {
  posts: {
    id: string;
    title: string;
    description: string;
    link: string;
    pubDate: string;
  }[];
  contents: {
    id: string;
    content: string;
  }[];
};

type TrendAnalysis = {
  id: string;
  title: string;
  relatedGame: string;
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
  constructor(@Inject(GENKIT) private readonly ai: Genkit) {}

  async run() {
    const news = await this.getNews();
    const analysis = await this.trendAnalysis(news.posts);

    return { analysis };
  }

  private async trendAnalysis(posts: Feed['posts']) {
    if (posts.length === 0) {
      return {
        id: 'N/A',
        title: 'N/A',
        relatedGame: 'N/A',
        publisher: 'N/A',
        why: 'No posts were provided for analysis.',
      } satisfies TrendAnalysis;
    }

    const prompt = this.ai.prompt('editor/trend_analysis');
    const { output } = await prompt({ posts });
    return output;
  }

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

      const isToday =
        dateObj.getUTCDate() === now.getUTCDate() &&
        dateObj.getUTCMonth() === now.getUTCMonth() &&
        dateObj.getUTCFullYear() === now.getUTCFullYear();

      if (!isToday) continue;

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
}
