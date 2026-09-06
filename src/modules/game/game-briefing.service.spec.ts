import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { GameBriefingService } from './game-briefing.service';

describe('GameBriefingService', () => {
  const ai = { generate: jest.fn() };
  const gameService = { findById: jest.fn() };
  const game = {
    $id: 'hades-2',
    name: 'Hades II',
    summaryPt: 'Uma princesa do submundo enfrenta o Titã do Tempo.',
    summary: null,
    genres: ['RPG', 'Roguelike'],
    releaseYear: '2025',
    ratingAvg: 92,
    ratingCount: 14,
  };

  const service = () =>
    new GameBriefingService(ai as never, gameService as never);

  beforeEach(() => jest.clearAllMocks());

  it('busca os fatos do jogo e devolve briefing estruturado da IA', async () => {
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
    ai.generate.mockResolvedValue({ output: { overview: 'incompleto' } });

    await expect(service().create('hades-2')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
