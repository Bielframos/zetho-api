import { Injectable } from '@nestjs/common';
import { GazethoService } from 'src/modules/gazetho/gazetho.service';

const SITE_BASE_URL = 'https://www.zetho.app';

const STATIC_SITEMAP_ENTRIES = [
  { path: '', changefreq: 'daily', priority: '1' },
];

@Injectable()
export class SitemapService {
  constructor(private readonly gazethoService: GazethoService) {}

  async getSitemapXml(): Promise<string> {
    const response = await this.gazethoService.getPostsForSitemap({
      page: 1,
      pageSize: 5000,
    });

    const urlEntries = [...STATIC_SITEMAP_ENTRIES, ...response.items].map(
      (entry) => this.buildUrlEntry(entry),
    );

    return this.renderSitemap(urlEntries);
  }

  private buildUrlEntry(
    entry:
      | { path: string; changefreq: string; priority: string }
      | {
          id: string;
          title: string;
          slug: string;
          $createdAt: string;
          $updatedAt: string;
        },
  ) {
    const loc = this.getUrl(entry);
    const lastmod = this.getLastModified(entry);
    const changefreq = this.getChangeFreq(entry);
    const priority = this.getPriority(entry);

    return [
      `<url>`,
      `<loc>${loc}</loc>`,
      `<lastmod>${lastmod}</lastmod>`,
      `<changefreq>${changefreq}</changefreq>`,
      `<priority>${priority}</priority>`,
      `</url>`,
    ].join('');
  }

  private getUrl(entry: any) {
    const path = 'path' in entry ? entry.path : `/noticias/${entry.slug}`;
    return new URL(path, SITE_BASE_URL).toString();
  }

  private getLastModified(entry: any) {
    if ('path' in entry) {
      return new Date().toISOString();
    }

    return new Date(entry.$updatedAt || entry.$createdAt).toISOString();
  }

  private getChangeFreq(entry: any) {
    if ('path' in entry) {
      return entry.changefreq;
    }

    const createdAt = new Date(entry.$createdAt);
    const ageInDays = Math.floor(
      (Date.now() - createdAt.getTime()) / 86_400_000,
    );

    if (ageInDays <= 7) {
      return 'daily';
    }

    if (ageInDays <= 30) {
      return 'weekly';
    }

    if (ageInDays <= 365) {
      return 'monthly';
    }

    return 'yearly';
  }

  private getPriority(entry: any) {
    if ('path' in entry) {
      return entry.priority;
    }

    return '0.8';
  }

  private renderSitemap(urlEntries: string[]) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries.join('')}\n</urlset>`;
  }
}
