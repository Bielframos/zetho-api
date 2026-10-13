import { Inject, Injectable } from '@nestjs/common';
import { z, type Genkit } from 'genkit';
import { GENKIT } from 'src/infra/ai/ai.constants';
import type { RecommendationContext } from './game-recommender.types';

const recommendationOutputSchema = z.object({
  gameId: z.string().min(1).max(96),
  reason: z.string().trim().min(10).max(300),
  matchSignals: z.array(z.string().trim().min(3).max(140)).min(2).max(4),
  basedOnGameIds: z.array(z.string().min(1).max(96)).max(3).optional(),
});

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

@Injectable()
export class GameRecommendationGeneratorService {
  private static readonly DEFAULT_MODEL = 'openai/gpt-5.4';
  private static readonly DEFAULT_TIMEOUT_MS = 8_000;
  readonly model =
    process.env.GAME_RECOMMENDER_MODEL ??
    GameRecommendationGeneratorService.DEFAULT_MODEL;
  private readonly timeoutMs = this.parseTimeout(
    process.env.GAME_RECOMMENDER_TIMEOUT_MS,
  );

  constructor(@Inject(GENKIT) private readonly ai: Genkit) {}

  async generateChoice(
    context: RecommendationContext,
  ): Promise<RecommendationOutput> {
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('game recommender model timeout'));
      }, this.timeoutMs);
      timeout.unref?.();
    });

    try {
      const generation = this.ai.generate({
        model: this.model,
        prompt: this.buildPrompt(context),
        output: { schema: recommendationOutputSchema },
        abortSignal: controller.signal,
      });
      const response = await Promise.race([generation, timeoutPromise]);
      const parsed = recommendationOutputSchema.safeParse(response.output);
      if (!parsed.success) throw new Error('invalid structured model output');

      const candidateIds = new Set(
        context.candidates.map((candidate) => candidate.game.id),
      );
      if (!candidateIds.has(parsed.data.gameId)) {
        throw new Error('model selected a game outside the candidate pool');
      }
      this.validateUserFacingOutput(parsed.data, context);
      return parsed.data;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private buildPrompt(context: RecommendationContext): string {
    const candidates = context.candidates.map((candidate) => ({
      id: candidate.game.id,
      name: candidate.game.name,
      source: candidate.source,
      genres: candidate.game.genres,
      ratingAvg: candidate.game.ratingAvg,
      ratingCount: candidate.game.ratingCount,
      releaseYear: candidate.game.releaseYear,
      preferenceScore: Number(candidate.score.toFixed(3)),
      affinities: candidate.basedOnGameIds.map((signalId) => {
        const signal = context.signals.find(
          (item) => item.game.id === signalId,
        );
        if (!signal) {
          return {
            basedOnGame: { id: signalId, name: null },
            sharedGenreIds: [],
            directlyRelated: false,
          };
        }
        return {
          basedOnGame: { id: signalId, name: signal.game.name },
          sharedGenreIds: candidate.game.genres.filter((genre) =>
            signal.game.genres.includes(genre),
          ),
          directlyRelated:
            signal.game.similarGames.includes(candidate.game.id) ||
            candidate.game.similarGames.includes(signal.game.id),
        };
      }),
    }));
    const recentSignals = context.signals.map((signal) => ({
      id: signal.game.id,
      name: signal.game.name,
      status: signal.status,
      liked: signal.liked,
      likedEver: signal.likedEver,
      genres: signal.game.genres,
      ratingAvg: signal.game.ratingAvg,
    }));

    return [
      '# Papel e personalidade',
      'Você é um amigo que conhece bem videogames e sugere a próxima experiência de forma calorosa, natural e confiante.',
      'Fale diretamente com a pessoa. A resposta deve parecer uma recomendação entre amigos, nunca uma análise do seu próprio processo de decisão.',
      '# Escolha',
      'Escolha exatamente um jogo do array candidates para recomendar.',
      'Use somente IDs presentes nos arrays fornecidos. basedOnGameIds deve conter apenas IDs de recentSignals.',
      'Priorize compatibilidade real de gameplay: loop principal, mecânicas, gênero e ritmo. Use arte, atmosfera, tema ou narrativa apenas como sinais secundários, nunca como a única afinidade.',
      'Não presuma que dois jogos têm gameplay, atmosfera ou estilo de arte semelhantes. Só cite uma afinidade quando ela for sustentada pelos dados fornecidos ou por uma característica amplamente conhecida dos dois jogos.',
      'Se o candidato tiver gameplay muito diferente de um recentSignal, não use esse jogo como base, mesmo que exista afinidade temática ou visual.',
      'Use affinities apenas para escolher e conferir conexões entre os jogos. Um gênero amplo isolado não basta para afirmar gameplay semelhante. Transforme os dados em linguagem natural e nunca copie nomes de campos.',
      'Inclua em basedOnGameIds somente jogos que sustentem diretamente a justificativa. Se não houver uma conexão direta clara, retorne basedOnGameIds vazio e recomende pelo backlog, avaliação ou popularidade sem forçar uma comparação.',
      '# Texto mostrado ao usuário',
      'Escreva reason em português do Brasil em uma ou duas frases curtas, específicas e amigáveis. Apresente o jogo e a conexão com o gosto da pessoa; não explique por que a escolha é tecnicamente válida.',
      'Forneça de 2 a 4 matchSignals curtos, com linguagem de jogador e foco na experiência, como mecânica, ritmo ou gênero. Prefira “Ação run-and-gun” e “Ritmo arcade acelerado” a descrições do processo de seleção.',
      'Nunca exponha IDs, nomes de campos, pontuações internas ou termos do sistema. Não use expressões como “mais defensável”, “evidência”, “similaridade de catálogo”, “affinities”, “preferenceScore”, “directlyRelated” ou “sharedGenreIds”.',
      'Exemplo de tom desejado: reason “Se Metal Slug Advance te divertiu, Blazing Chrome é uma ótima próxima escolha: ele mantém a ação run-and-gun, o ritmo acelerado e a energia arcade.”; matchSignals [“Ação run-and-gun”, “Ritmo arcade acelerado”, “Combate 2D direto”].',
      'Não invente características.',
      JSON.stringify({ candidates, recentSignals }),
    ].join('\n');
  }

  private validateUserFacingOutput(
    choice: RecommendationOutput,
    context: RecommendationContext,
  ) {
    const visibleText = [choice.reason, ...choice.matchSignals].join(' ');
    const internalLanguage =
      /\b(?:mais\s+defens[aá]vel|evid[eê]ncia|affinities|preferenceScore|directlyRelated|sharedGenreIds|pontua(?:ç|c)[aã]o\s+interna)\b|similaridade.{0,30}cat[aá]logo|cat[aá]logo.{0,30}similaridade/iu;
    if (internalLanguage.test(visibleText)) {
      throw new Error('model output exposed internal recommendation language');
    }

    const normalizedText = visibleText.toLocaleLowerCase('pt-BR');
    const exposedId = [...context.candidates, ...context.signals]
      .map((item) => item.game)
      .some((game) => {
        const id = game.id.toLocaleLowerCase('pt-BR');
        const name = game.name.toLocaleLowerCase('pt-BR');
        return id !== name && normalizedText.includes(id);
      });
    if (exposedId) {
      throw new Error('model output exposed a technical game identifier');
    }
  }

  private parseTimeout(raw: string | undefined) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 100 || parsed > 60_000) {
      return GameRecommendationGeneratorService.DEFAULT_TIMEOUT_MS;
    }
    return Math.floor(parsed);
  }
}
