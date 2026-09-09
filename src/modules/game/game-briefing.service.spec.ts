import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { GameBriefingService } from './game-briefing.service';

describe('GameBriefingService', () => {
  const ai = { generate: jest.fn() };
  const gameService = { findById: jest.fn() };
  const tablesDB = {
    getRow: jest.fn(),
    createRow: jest.fn(),
    updateRow: jest.fn(),
  };
  const game = {
    $id: 'hades-2',
    name: 'Hades II',
    summaryPt: 'Uma princesa do submundo enfrenta o Titã do Tempo.',
    summary: null,
    genres: ['RPG', 'Roguelike'],
    releaseYear: '2025',
    releaseDate: new Date().toISOString(),
    ratingAvg: 92,
    ratingCount: 14,
  };

  const service = () =>
    new GameBriefingService(
      ai as never,
      gameService as never,
      { tablesDB } as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('busca os fatos do jogo e devolve briefing estruturado da IA', async () => {
    tablesDB.getRow.mockRejectedValue({ code: 404 });
    tablesDB.createRow.mockResolvedValue({
      $id: 'hades-2',
      gameId: 'hades-2',
      generatedAt: '2026-09-06T00:00:00.000Z',
      overview:
        'Uma aventura roguelike mitológica focada em combate e repetição.',
      highlights: ['Combate rápido', 'Progressão entre tentativas'],
      bestFor: ['Fãs de roguelikes de ação'],
      contentWarning: 'Violência de fantasia na premissa.',
      model: 'openai/gpt-4o-mini',
      promptVersion: 1,
    });
    ai.generate.mockResolvedValue({
      output: {
        overview:
          'Uma aventura roguelike mitológica focada em combate e repetição.',
        highlights: ['Combate rápido', 'Progressão entre tentativas'],
        bestFor: ['Fãs de roguelikes de ação'],
        contentWarning: 'Violência de fantasia na premissa.',
      },
    });
    gameService.findById.mockResolvedValue(game);

    await expect(service().create('hades-2')).resolves.toMatchObject({
      highlights: ['Combate rápido', 'Progressão entre tentativas'],
      source: 'generated',
    });
    expect(gameService.findById).toHaveBeenCalledWith(
      'hades-2',
      expect.stringContaining('summaryPt'),
    );
    expect(ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'openai/gpt-4o-mini' }),
    );
  });

  it('preserva 404 quando o jogo não existe sem chamar a IA', async () => {
    gameService.findById.mockRejectedValue(new NotFoundException());

    await expect(service().create('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('converte indisponibilidade ou saída inválida da IA em 502', async () => {
    gameService.findById.mockResolvedValue(game);
    tablesDB.getRow.mockRejectedValue({ code: 404 });
    ai.generate.mockResolvedValue({ output: { overview: 'incompleto' } });

    await expect(service().create('hades-2')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('reutiliza briefing armazenado para jogo antigo sem chamar a IA', async () => {
    gameService.findById.mockResolvedValue({
      ...game,
      releaseDate: '2020-01-01T00:00:00.000Z',
    });
    tablesDB.getRow.mockResolvedValue({
      $id: 'hades-2',
      gameId: 'hades-2',
      generatedAt: '2020-01-01T00:00:00.000Z',
      overview: 'Salvo',
      highlights: ['Um', 'Dois'],
      bestFor: ['Todos'],
      contentWarning: 'Nenhum',
      model: 'openai/gpt-4o-mini',
      promptVersion: 1,
    });

    await expect(service().create('hades-2')).resolves.toMatchObject({
      source: 'stored',
      overview: 'Salvo',
    });
    expect(ai.generate).not.toHaveBeenCalled();
    expect(tablesDB.createRow).not.toHaveBeenCalled();
  });

  it('regenera briefing vencido para jogo recente', async () => {
    gameService.findById.mockResolvedValue(game);
    tablesDB.getRow.mockResolvedValue({
      $id: 'hades-2',
      gameId: 'hades-2',
      generatedAt: '2020-01-01T00:00:00.000Z',
      overview: 'Velho',
      highlights: ['Um', 'Dois'],
      bestFor: ['Todos'],
      contentWarning: 'Nenhum',
      model: 'openai/gpt-4o-mini',
      promptVersion: 1,
    });
    tablesDB.updateRow.mockResolvedValue({
      $id: 'hades-2',
      gameId: 'hades-2',
      generatedAt: '2026-09-06T00:00:00.000Z',
      overview: 'Novo',
      highlights: ['Um', 'Dois'],
      bestFor: ['Todos'],
      contentWarning: 'Nenhum',
      model: 'openai/gpt-4o-mini',
      promptVersion: 1,
    });
    ai.generate.mockResolvedValue({
      output: {
        overview: 'Novo',
        highlights: ['Um', 'Dois'],
        bestFor: ['Todos'],
        contentWarning: 'Nenhum',
      },
    });

    await expect(service().create('hades-2')).resolves.toMatchObject({
      source: 'generated',
      overview: 'Novo',
    });
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1);
  });
});
