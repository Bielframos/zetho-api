import { Injectable } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import { ID } from 'node-appwrite';

export type EditorialFeed = {
  posts: {
    id: string;
    title: string;
    description: string;
    link: string;
    pubDate: string;
    content?: string;
  }[];
  contents: { id: string; content: string }[];
};

export type NewsCaptureOptions = { captureWindowHours?: number };

const DEFAULT_CAPTURE_WINDOW_HOURS = 24;
const feedUrls = [
  'https://feeds.feedburner.com/ign/games-all',
  'https://www.gamespot.com/feeds/game-news',
  'https://blog.playstation.com/feed/',
  'https://news.xbox.com/en-us/feed/',
  'https://www.videogameschronicle.com/feed/',
];

@Injectable()
export class EditorialFeedService {
  private readonly defaultCaptureWindowHours =
    this.resolveCaptureWindowHours(
      process.env.EDITOR_NEWS_CAPTURE_WINDOW_HOURS,
    ) ?? DEFAULT_CAPTURE_WINDOW_HOURS;

  async getNews(options: NewsCaptureOptions = {}): Promise<EditorialFeed> {
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
      { posts: [], contents: [] } as EditorialFeed,
    );
  }

  private async fetchRSS(
    url: string,
    captureWindowHours: number,
  ): Promise<EditorialFeed> {
    const response = await fetch(url);
    const text = await response.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const items = [
      ...Array.from(xml.getElementsByTagName('item')),
      ...Array.from(xml.getElementsByTagName('entry')),
    ];
    const posts: EditorialFeed['posts'] = [];
    const contents: EditorialFeed['contents'] = [];
    for (const el of items) {
      const pubDate =
        el.getElementsByTagName('pubDate')[0]?.textContent ||
        el.getElementsByTagName('published')[0]?.textContent ||
        el.getElementsByTagName('updated')[0]?.textContent ||
        '';
      const dateObj = new Date(pubDate);
      const ageMs = Date.now() - dateObj.getTime();
      if (
        Number.isNaN(dateObj.getTime()) ||
        ageMs < 0 ||
        ageMs > captureWindowHours * 60 * 60 * 1000
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
    posts.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );
    return { posts, contents };
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
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    return Math.min(numericValue, 24 * 30);
  }
}
