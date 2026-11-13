import { SitemapService } from './sitemap.service';

describe('SitemapService', () => {
  const previousFrontendAppUrl = process.env.FRONTEND_APP_URL;

  afterEach(() => {
    if (previousFrontendAppUrl === undefined)
      delete process.env.FRONTEND_APP_URL;
    else process.env.FRONTEND_APP_URL = previousFrontendAppUrl;
  });

  it('uses the first configured frontend URL for static and dynamic links', async () => {
    process.env.FRONTEND_APP_URL =
      ' https://site.example///,https://secondary.example/ ';
    const cache = { get: jest.fn(), set: jest.fn() };
    const gazetho = {
      getPostsForSitemap: jest.fn().mockResolvedValue({
        items: [{ slug: 'latest', $createdAt: '2026-10-13T00:00:00Z' }],
      }),
    };
    const games = {
      listIndexableGames: jest
        .fn()
        .mockResolvedValue([{ slug: 'game-one', lastmod: null }]),
    };
    const forum = {
      listIndexablePostsForSitemap: jest.fn().mockResolvedValue([
        {
          slug: 'debate-elden-ring--post-1',
          lastmod: '2026-10-14T00:00:00Z',
        },
      ]),
    };
    const service = new SitemapService(
      gazetho as never,
      games as never,
      cache as never,
      forum as never,
      {
        publicIndex: jest.fn().mockResolvedValue([{ slug: 'zetho-list-1' }]),
      } as never,
    );

    const xml = await service.getSitemapXml();

    expect(xml).toContain('<loc>https://site.example</loc>');
    expect(xml).toContain(
      '<loc>https://site.example/listas/zetho-list-1</loc>',
    );
    expect(cache.set).toHaveBeenCalledWith(
      'sitemap:xml',
      expect.any(String),
      300000,
    );
    expect(xml).toContain('<loc>https://site.example/forum</loc>');
    expect(xml).toContain('<loc>https://site.example/noticias/latest</loc>');
    expect(xml).toContain('<loc>https://site.example/jogo/game-one</loc>');
    expect(xml).toContain(
      '<loc>https://site.example/forum/debate-elden-ring--post-1</loc>',
    );
  });
});
