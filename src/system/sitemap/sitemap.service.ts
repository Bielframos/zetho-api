import { EditorialListsService } from 'src/modules/editorial-lists/editorial-lists.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { GameService } from 'src/modules/game/game.service';
import { GazethoService } from 'src/modules/gazetho/gazetho.service';
import { ForumService } from 'src/modules/social/forum.service';
import { resolveFrontendOrigin } from 'src/common/utils/frontend-origin';

type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

/**
 * Páginas estáticas que valem indexação. As rotas de autenticação, admin,
 * loja, busca e afins ficam de fora — estão no `Disallow` do robots.txt.
 */
const STATIC_PATHS = [
  '',
  '/forum',
  '/noticias',
  '/listas-editoriais',
  '/sobre',
  '/contato',
  '/termos',
  '/privacidade',
  '/politica-editorial',
];

const CACHE_KEY = 'sitemap:xml';
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(
    private readonly gazethoService: GazethoService,
    private readonly gameService: GameService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly forumService: ForumService,
    private readonly editorialLists: EditorialListsService,
  ) {}

  /**
   * URL pública do site, sem barra final.
   *
   * Vinha hardcoded. Como a variável de ambiente é cadastrada com barra final
   * e o `new URL(path, base)` a trata de forma diferente, normalizar aqui
   * evita gerar `//jogo/...` no XML.
   */
  private get baseUrl() {
    return resolveFrontendOrigin();
  }

  async getSitemapXml(): Promise<string> {
    const cached = await this.cache.get<string>(CACHE_KEY);
    if (cached) return cached;

    const entries: SitemapEntry[] = [
      ...STATIC_PATHS.map((path) => ({ loc: `${this.baseUrl}${path}` })),
      ...(await this.getNewsEntries()),
      ...(await this.getGameEntries()),
      ...(await this.getForumEntries()),
      ...(await this.getEditorialEntries()),
    ];

    const xml = this.renderSitemap(entries);
    await this.cache.set(CACHE_KEY, xml, CACHE_TTL_MS);

    return xml;
  }

  private async getNewsEntries(): Promise<SitemapEntry[]> {
    try {
      const response = await this.gazethoService.getPostsForSitemap({
        page: 1,
        pageSize: 5000,
      });

      return response.items.map((post: any) => ({
        loc: `${this.baseUrl}/noticias/${post.slug}`,
        lastmod: this.toIsoDate(post.$updatedAt || post.$createdAt),
      }));
    } catch (error) {
      this.logger.error(`Falha ao montar notícias do sitemap: ${error}`);
      return [];
    }
  }

  /**
   * Só entram jogos indexáveis — os que têm pelo menos uma crítica com texto.
   *
   * O predicado é o mesmo consumido pela meta `robots` da página
   * (`GET /games/:slug` devolve `seo.indexable`). Listar no sitemap uma URL
   * que se declara `noindex` é sinal contraditório e o Google penaliza.
   */
  private async getGameEntries(): Promise<SitemapEntry[]> {
    try {
      const games = await this.gameService.listIndexableGames();

      return games.map((game) => ({
        loc: `${this.baseUrl}/jogo/${game.slug}`,
        lastmod: this.toIsoDate(game.lastmod),
      }));
    } catch (error) {
      this.logger.error(`Falha ao montar jogos do sitemap: ${error}`);
      return [];
    }
  }

  private async getForumEntries(): Promise<SitemapEntry[]> {
    try {
      const posts = await this.forumService.listIndexablePostsForSitemap();

      return posts.map((post) => ({
        loc: `${this.baseUrl}/forum/${encodeURIComponent(post.slug)}`,
        lastmod: this.toIsoDate(post.lastmod),
      }));
    } catch (error) {
      this.logger.error(
        `Falha ao montar tópicos do fórum no sitemap: ${error}`,
      );
      return [];
    }
  }

  private async getEditorialEntries(): Promise<SitemapEntry[]> {
    try {
      return (await this.editorialLists.publicIndex()).map((list) => ({
        loc: `${this.baseUrl}/listas-editoriais/${encodeURIComponent(list.slug)}`,
      }));
    } catch {
      return [];
    } // Optional until the additive private table is provisioned.
  }

  private toIsoDate(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  /**
   * Sem `changefreq` e sem `priority`: o Google ignora os dois há anos, e
   * `lastmod` inventado (era `new Date()` para toda entrada estática) treina o
   * crawler a desconsiderar o campo. Só emitimos `lastmod` quando é verdade.
   */
  private renderSitemap(entries: SitemapEntry[]) {
    const urls = entries
      .map((entry) => {
        const lastmod = entry.lastmod
          ? `<lastmod>${entry.lastmod}</lastmod>`
          : '';
        return `<url><loc>${this.escapeXml(entry.loc)}</loc>${lastmod}</url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`;
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
