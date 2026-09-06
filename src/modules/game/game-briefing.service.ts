import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { z, type Genkit } from 'genkit';
import type { Games as Game } from 'src/infra/appwrite/appwrite';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { GameService } from './game.service';

const briefingSchema = z.object({
  overview: z.string().min(1).max(700),
  highlights: z.array(z.string().min(1).max(220)).min(2).max(5),
  bestFor: z.array(z.string().min(1).max(160)).min(1).max(4),
  contentWarning: z.string().min(1).max(280),
});

export type GameBriefing = z.infer<typeof briefingSchema>;

/**
 * Gera um briefing curto e orientado a decisão. Os dados factuais vêm somente
 * do catálogo; a IA é instruída a não inventar plataformas, duração ou notas.
 */
@Injectable()
export class GameBriefingService {
  private readonly logger = new Logger(GameBriefingService.name);

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
  ) {}

  async create(gameId: string): Promise<GameBriefing> {
    const game = await this.gameService.findById(
      gameId,
      'name,summary,summaryPt,genres,releaseYear,ratingAvg,ratingCount',
    );

    try {
      const response = await this.ai.generate({
        model: 'openai/gpt-4o-mini',
        prompt: this.buildPrompt(game),
        output: { schema: briefingSchema },
      });

      const parsed = briefingSchema.safeParse(response.output);
      if (!parsed.success) {
        this.logger.warn(`Resposta estruturada inválida para jogo ${gameId}`);
        throw new Error('invalid structured AI output');
      }

      return parsed.data;
    } catch (error) {
      this.logger.error(
        `Não foi possível gerar briefing para jogo ${gameId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        'Não foi possível gerar o briefing por IA neste momento.',
      );
    }
  }

  private buildPrompt(game: Game): string {
    const facts = {
      name: game.name,
      synopsis: game.summaryPt || game.summary || 'Não informada no catálogo',
      genres: game.genres ?? [],
      releaseYear: game.releaseYear,
      ratingAverage: game.ratingCount > 0 ? game.ratingAvg : undefined,
      ratingCount: game.ratingCount || undefined,
    };

    return [
      'Você é um curador de jogos escrevendo em português brasileiro.',
      'Crie um briefing útil para decidir se vale jogar, exclusivamente com os fatos abaixo.',
      'Não invente plataformas, mecânicas, duração, multiplayer, classificação etária ou fatos ausentes.',
      'Em contentWarning, informe apenas alertas sustentados pela sinopse; se não houver base, escreva "Sem avisos de conteúdo informados no catálogo.".',
      'Seja conciso, neutro e não use markdown.',
      `FATOS DO CATÁLOGO: ${JSON.stringify(facts)}`,
    ].join('\n');
  }
}
