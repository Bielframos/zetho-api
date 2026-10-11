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
  const appwrite = overrides.appwrite ?? {
    tablesDB: { listRows: jest.fn(), createRow: jest.fn() },
  };
  const youtubeService = overrides.youtubeService ?? {
    searchVideos: jest.fn(),
  };
  const notificationsService = overrides.notificationsService ?? {
    sharePost: jest.fn(),
  };
  const contentExtractor = overrides.contentExtractor ?? { extract: jest.fn() };
  const correlationContext = {
    runWithGeneratedCorrelationId: (fn: any) => fn(),
  };
  const loggerContext = { trackLifecycle: (_l: any, _m: any, fn: any) => fn() };
  const outboxService = overrides.outboxService ?? {
    enqueueImmediate: jest.fn(),
  };

  const service = new EditorService(
    ai as never,
    gameService as never,
    appwrite as never,
    youtubeService as never,
    notificationsService as never,
    correlationContext as never,
    loggerContext as never,
    contentExtractor as never,
    outboxService as never,
  );
  return {
    service,
    ai,
    gameService,
    appwrite,
    notificationsService,
    contentExtractor,
    outboxService,
  };
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

    const handler = ai.definedTools['gameSearchTool'];
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

describe('EditorService.generateGuidedArticle', () => {
  const guidedArticleTitle =
    'Hades II detalha novidades para uma jornada cooperativa';
  const guidedArticleBody = [
    '<p>A atualização apresentada para Hades II amplia as possibilidades de cooperação ao reorganizar encontros, recompensas e objetivos compartilhados. A proposta mantém o ritmo característico da série, mas incentiva decisões coordenadas desde a escolha das bênçãos até o momento de enfrentar cada guardião. O estúdio também destacou que a progressão continuará valorizando experimentação, leitura dos padrões inimigos e combinações diferentes a cada tentativa.</p>',
    '<p>Durante as partidas, cada participante poderá assumir uma função complementar sem ficar preso a uma classe permanente. Armas, melhorias temporárias e efeitos concedidos pelos deuses alteram a composição do grupo ao longo da jornada. Essa flexibilidade permite que uma dupla adapte sua estratégia quando encontra salas mais agressivas, desafios opcionais ou recursos raros, evitando que uma escolha feita no início determine todo o restante da campanha.</p>',
    '<p>O sistema de recompensas foi ajustado para reconhecer tanto o avanço coletivo quanto as contribuições individuais. Objetivos concluídos em conjunto liberam materiais para o acampamento, enquanto ações de suporte e sequências bem executadas alimentam bônus próprios. Segundo as informações divulgadas, a intenção é impedir que apenas o maior dano defina o desempenho e criar espaço para estilos defensivos, controle de área e preparação cuidadosa antes dos confrontos principais.</p>',
    '<p>A experiência cooperativa também recebeu opções para facilitar encontros entre jogadores com rotinas diferentes. Será possível retomar uma jornada a partir de pontos seguros, revisar as escolhas recentes e combinar previamente quais recursos devem ser priorizados. Indicadores visuais foram redesenhados para comunicar perigos e oportunidades sem cobrir a ação, enquanto configurações de acessibilidade permitem ajustar contraste, intensidade de efeitos e velocidade de determinados avisos.</p>',
    '<p>Mesmo com essas mudanças, a estrutura narrativa permanece ligada às tentativas sucessivas e às conversas que acontecem depois de cada retorno. Personagens reconhecem resultados importantes, comentam estratégias utilizadas e oferecem novas perspectivas sobre os conflitos do submundo. A combinação entre progressão, narrativa reativa e cooperação busca fazer com que cada sessão produza histórias próprias, sem abandonar a tensão e a precisão que sustentam a identidade de Hades II.</p>',
  ].join('');

  const buildArticleOutput = () => ({
    post: {
      title: guidedArticleTitle,
      subtitle: 'sub',
      slug: 'titulo-final',
      body: guidedArticleBody,
      status: 'published',
      tags: ['hades-ii'],
      relatedGameIds: [],
      seo: { title: 't', description: 'd' },
      originalSourceUrl: 'https://fonte.com/post',
    },
  });

  const setup = () => {
    const ai = buildAi();
    const writer = jest
      .fn()
      .mockResolvedValue({ output: buildArticleOutput() });
    ai.prompt.mockImplementation((name: string) =>
      name === 'editor/eligibility'
        ? jest.fn().mockResolvedValue({
            output: {
              eligible: true,
              category: 'announcement',
              reason: 'Concrete game news',
            },
          })
        : name === 'editor/verify_article'
          ? jest
              .fn()
              .mockResolvedValue({ output: { supported: true, issues: [] } })
          : name === 'editor/trend_analysis'
            ? jest.fn().mockResolvedValue({
                output: {
                  id: 'selected',
                  title: 'Announcement',
                  publisher: 'Source',
                  why: 'New event',
                },
              })
            : writer,
    );

    const contentExtractor = {
      extract: jest.fn().mockResolvedValue({
        title: 'Manchete',
        text: 'Texto longo extraído da página de contexto fornecida.',
      }),
    };
    const appwrite = {
      tablesDB: {
        listRows: jest.fn().mockResolvedValue({ rows: [] }),
        createRow: jest.fn().mockResolvedValue({
          $id: 'post-guided-1',
          title: guidedArticleTitle,
          subtitle: 'sub',
          slug: 'titulo-final',
          status: 'published',
          relatedGameIds: [],
        }),
      },
    };
    const notificationsService = {
      sharePost: jest.fn().mockResolvedValue(undefined),
    };
    global.fetch = jest.fn(
      async () => new Response('{}', { status: 200 }),
    ) as any;

    return buildService({
      ai,
      contentExtractor,
      appwrite,
      notificationsService,
    });
  };

  it('extrai a URL, repassa humanInstructions e publica o post', async () => {
    const { service, contentExtractor, ai, appwrite, outboxService } = setup();

    const result = await service.generateGuidedArticle({
      url: 'https://fonte.com/post',
      instructions: 'Foque no modo cooperativo.',
    });

    expect(contentExtractor.extract).toHaveBeenCalledWith(
      'https://fonte.com/post',
    );

    const promptFn =
      ai.prompt.mock.results[
        ai.prompt.mock.calls.findIndex(
          ([name]: string[]) => name === 'editor/write_article',
        )
      ].value;
    expect(promptFn).toHaveBeenCalledWith(
      expect.objectContaining({
        humanInstructions: 'Foque no modo cooperativo.',
        post: expect.objectContaining({
          content: 'Texto longo extraído da página de contexto fornecida.',
          link: 'https://fonte.com/post',
        }),
      }),
      expect.objectContaining({ tools: expect.any(Array) }),
    );

    expect(appwrite.tablesDB.createRow).toHaveBeenCalledTimes(1);
    expect(appwrite.tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mainImage: null }),
      }),
    );
    expect(outboxService.enqueueImmediate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ skipped: false });
  });

  it('retains unsupported generated claims as drafts without notifications', async () => {
    const { service, ai, appwrite, outboxService } = setup();
    const original = ai.prompt.getMockImplementation()!;
    ai.prompt.mockImplementation((name: string) =>
      name === 'editor/verify_article'
        ? jest
            .fn()
            .mockResolvedValue({
              output: {
                supported: false,
                issues: ['Brazilian launch date absent from source'],
              },
            })
        : original(name),
    );
    appwrite.tablesDB.createRow.mockImplementation(async ({ data }: any) => ({
      ...data,
      $id: 'draft',
    }));
    await service.generateGuidedArticle({ url: 'https://fonte.com/post' });
    expect(appwrite.tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'draft',
          originalSourceUrl: 'https://fonte.com/post',
        }),
      }),
    );
    expect(outboxService.enqueueImmediate).not.toHaveBeenCalled();
  });

  it('pula quando a URL de origem já foi publicada', async () => {
    const { service, appwrite, outboxService, contentExtractor } = setup();
    appwrite.tablesDB.listRows.mockResolvedValue({
      rows: [{ $id: 'existente' }],
    });

    const result = await service.generateGuidedArticle({
      url: 'https://fonte.com/post',
    });

    expect(result).toMatchObject({ skipped: true });
    expect(contentExtractor.extract).not.toHaveBeenCalled();
    expect(outboxService.enqueueImmediate).not.toHaveBeenCalled();
  });
});
