import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ID, type Models } from 'node-appwrite';
import { z, type Genkit } from 'genkit';
import type { Games as Game } from 'src/infra/appwrite/appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { GENKIT } from 'src/infra/ai/ai.constants';
import { GameService } from './game.service';

const briefingSchema = z.object({
  overview: z.string().min(1).max(700),
  highlights: z.array(z.string().min(1).max(220)).min(2).max(5),
  bestFor: z.array(z.string().min(1).max(160)).min(1).max(4),
  contentWarning: z.string().min(1).max(280),
});

export type GameBriefing = z.infer<typeof briefingSchema>;
export type PersistedGameBriefing = GameBriefing & {
  generatedAt: string;
  source: 'generated' | 'stored';
};

type BriefingRow = Models.Row &
  GameBriefing & {
    gameId: string;
    generatedAt: string;
    model: string;
    promptVersion: number;
  };

const TABLE_ID = 'game_ai_briefings';
const RECENT_GAME_DAYS = 90;
const RECENT_BRIEFING_TTL_DAYS = 45;
const MODEL = 'openai/gpt-4o-mini';
const PROMPT_VERSION = 1;

/**
 * Gera um briefing curto e orientado a decisão. Os dados factuais vêm somente
 * do catálogo; a IA é instruída a não inventar plataformas, duração ou notas.
 */
@Injectable()
export class GameBriefingService {
  private readonly logger = new Logger(GameBriefingService.name);
  private readonly generationPromises = new Map<
    string,
    Promise<PersistedGameBriefing>
  >();

  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly appwrite: Appwrite,
  ) {}

  async create(gameId: string): Promise<PersistedGameBriefing> {
    const inFlight = this.generationPromises.get(gameId);
    if (inFlight) return inFlight;

    const promise = this.createOrReuse(gameId).finally(() =>
      this.generationPromises.delete(gameId),
    );
    this.generationPromises.set(gameId, promise);
    return promise;
  }

  private async createOrReuse(gameId: string): Promise<PersistedGameBriefing> {
    const game = await this.gameService.findById(
      gameId,
      'name,summary,summaryPt,genres,releaseDate,releaseYear,ratingAvg,ratingCount',
    );
    const stored = await this.findStored(gameId);
    if (stored && !this.shouldRegenerate(game, stored)) {
      return { ...this.toBriefing(stored), source: 'stored' };
    }

    try {
      const response = await this.ai.generate({
        model: MODEL,
        prompt: this.buildPrompt(game),
        output: { schema: briefingSchema },
      });

      const parsed = briefingSchema.safeParse(response.output);
      if (!parsed.success) {
        this.logger.warn(`Resposta estruturada inválida para jogo ${gameId}`);
        throw new Error('invalid structured AI output');
      }

      const generatedAt = new Date().toISOString();
      const row = await this.save(
        gameId,
        parsed.data,
        generatedAt,
        Boolean(stored),
      );
      return { ...this.toBriefing(row), source: 'generated' };
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

  private async findStored(gameId: string): Promise<BriefingRow | null> {
    try {
      return await this.appwrite.tablesDB.getRow<BriefingRow>({
        databaseId: 'app',
        tableId: TABLE_ID,
        rowId: gameId,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  private shouldRegenerate(game: Game, briefing: BriefingRow) {
    if (!game.releaseDate) return false;
    const now = Date.now();
    const releasedAt = new Date(game.releaseDate).getTime();
    const generatedAt = new Date(briefing.generatedAt).getTime();
    if (Number.isNaN(releasedAt) || Number.isNaN(generatedAt)) return false;
    const day = 24 * 60 * 60 * 1000;
    return (
      now - releasedAt <= RECENT_GAME_DAYS * day &&
      now - generatedAt > RECENT_BRIEFING_TTL_DAYS * day
    );
  }

  private async save(
    gameId: string,
    briefing: GameBriefing,
    generatedAt: string,
    exists: boolean,
  ) {
    const data = {
      gameId,
      ...briefing,
      generatedAt,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    };
    if (exists) {
      return this.appwrite.tablesDB.updateRow<BriefingRow>({
        databaseId: 'app',
        tableId: TABLE_ID,
        rowId: gameId,
        data,
      });
    }
    return this.appwrite.tablesDB.createRow<BriefingRow>({
      databaseId: 'app',
      tableId: TABLE_ID,
      rowId: gameId || ID.unique(),
      data,
    });
  }

  private toBriefing(row: BriefingRow): Omit<PersistedGameBriefing, 'source'> {
    return {
      overview: row.overview,
      highlights: row.highlights,
      bestFor: row.bestFor,
      contentWarning: row.contentWarning,
      generatedAt: row.generatedAt,
    };
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
