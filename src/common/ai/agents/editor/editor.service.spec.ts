import { EditorService } from './editor.service';

const buildAi = () => {
  const definedTools: Record<string, (input: any) => Promise<any>> = {};
  return {
    definedTools,
    defineTool: jest.fn((config: { name: string }, handler: any) => {
      definedTools[config.name] = handler;
      return { name: config.name };
    }),
    prompt: jest.fn(),
  };
};

const buildService = (overrides: Partial<Record<string, any>> = {}) => {
  const ai = overrides.ai ?? buildAi();
  const gameService = overrides.gameService ?? { search: jest.fn() };
  const appwrite = overrides.appwrite ?? { tablesDB: { listRows: jest.fn(), createRow: jest.fn() } };
  const youtubeService = overrides.youtubeService ?? { searchVideos: jest.fn() };
  const notificationsService = overrides.notificationsService ?? { sharePost: jest.fn() };
  const contentExtractor = overrides.contentExtractor ?? { extract: jest.fn() };
  const correlationContext = { runWithGeneratedCorrelationId: (fn: any) => fn() };
  const loggerContext = { trackLifecycle: (_l: any, _m: any, fn: any) => fn() };

  const service = new EditorService(
    ai as never,
    gameService as never,
    appwrite as never,
    youtubeService as never,
    notificationsService as never,
    correlationContext as never,
    loggerContext as never,
    contentExtractor as never,
  );
  return { service, ai, gameService, appwrite, notificationsService, contentExtractor };
};

describe('EditorService gameSearchTool', () => {
  it('busca jogos via gameService.search e mapeia $id/name/slug', async () => {
    const gameService = {
      search: jest.fn().mockResolvedValue({
        results: [
          { $id: 'g1', name: 'Hades II', slug: 'hades-ii', coverUrl: 'x' },
          { $id: 'g2', name: 'Hades', slug: 'hades', coverUrl: 'y' },
        ],
      }),
    };
    const { service, ai } = buildService({ gameService });

    void (service as any).gameSearchTool;

    const handler = (ai as any).definedTools['gameSearchTool'];
    expect(handler).toBeDefined();
    const out = await handler({ query: 'Hades' });

    expect(gameService.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Hades' }),
    );
    expect(out).toEqual([
      { $id: 'g1', name: 'Hades II', slug: 'hades-ii' },
      { $id: 'g2', name: 'Hades', slug: 'hades' },
    ]);
  });
});

describe('EditorService.resolveMainImage', () => {
  it('não derruba o artigo quando findById lança; cai no fallback', async () => {
    const gameService = {
      findById: jest.fn().mockRejectedValue(new Error('not found')),
      search: jest.fn(),
    };
    const { service } = buildService({ gameService });

    const article = {
      post: { relatedGameIds: ['ghost-id'] },
      imageStrategy: { needsImage: true, type: 'game' },
    };

    const result = await (service as any).resolveMainImage(article);

    expect(gameService.findById).toHaveBeenCalledWith('ghost-id', 'name,slug');
    expect(result).toBeNull();
  });
});
