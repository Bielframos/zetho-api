/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { GameRecommenderService } from './game-recommender.service';
import type {
  GameRecommendationRow,
  RecommendationContext,
  RecommenderGame,
} from './game-recommender.types';

describe('GameRecommenderService', () => {
  const game: RecommenderGame = {
    id: 'game-1',
    name: 'Game One',
    slug: 'game-one',
    coverUrl: 'https://example.com/cover.jpg',
    releaseYear: '2026',
    genres: ['action'],
    ratingAvg: 4.5,
    ratingCount: 100,
    hypes: 20,
    similarGames: [],
  };
  const context: RecommendationContext = {
    profile: {
      id: 'profile-1',
      userId: 'user-1',
      fingerprint: 'fp-1',
      balance: 20,
    },
    signals: [],
    candidates: [{ game, source: 'new', score: 12, basedOnGameIds: [] }],
  };

  const pendingRow = (): GameRecommendationRow =>
    ({
      $id: 'recommendation-1',
      $sequence: 1,
      $createdAt: '2026-09-09T00:00:00.000Z',
      $updatedAt: '2026-09-09T00:00:00.000Z',
      $permissions: [],
      $databaseId: 'app',
      $tableId: 'game_recommendations',
      userId: 'user-1',
      ownerFingerprint: 'fp-1',
      idempotencyKey: 'request-1',
      dailyKey: null,
      gameId: null,
      scope: 'new',
      source: null,
      reason: null,
      matchSignals: null,
      basedOnGameIds: null,
      state: 'pending',
      cost: 5,
      refunded: false,
      model: 'openai/gpt-5.4',
      promptVersion: 3,
      generatedAt: null,
      balance: null,
      failureCode: null,
    }) as GameRecommendationRow;

  function setup(
    options: {
      balance?: number;
      existing?: GameRecommendationRow;
      transactionFailure?: Error;
    } = {},
  ) {
    let recommendation = options.existing ?? pendingRow();
    const ai = { generate: jest.fn() };
    const candidates = {
      build: jest.fn().mockResolvedValue(context),
      getGamesByIds: jest.fn(async (ids: string[]) =>
        ids.includes(game.id) ? [game] : [],
      ),
    };
    let balance = options.balance ?? 20;
    let initialLookup = true;
    const tablesDB = {
      listRows: jest.fn(async ({ tableId }: { tableId: string }) => {
        if (tableId === 'game_recommendations') {
          if (options.existing) return { total: 1, rows: [options.existing] };
          if (initialLookup) {
            initialLookup = false;
            return { total: 0, rows: [] };
          }
          return { total: 0, rows: [] };
        }
        if (tableId === 'user_profiles') {
          return { total: 1, rows: [{ $id: 'profile-1', userId: 'user-1' }] };
        }
        return { total: 0, rows: [] };
      }),
      getRow: jest.fn(async ({ tableId }: { tableId: string }) => {
        if (tableId === 'user_profiles')
          return { $id: 'profile-1', zcoinBalance: balance };
        return recommendation;
      }),
      decrementRowColumn: jest.fn(
        async ({ value, min }: { value: number; min: number }) => {
          if (balance - value < min)
            throw new BadRequestException('Saldo insuficiente');
          balance -= value;
          return {};
        },
      ),
      createOperations: jest.fn(
        async ({ operations }: { operations: any[] }) => {
          for (const operation of operations) {
            if (operation.action === 'decrement')
              balance -= operation.data.value;
            if (operation.action === 'increment')
              balance += operation.data.value;
          }
        },
      ),
      createRow: jest.fn(
        async ({ tableId, data }: { tableId: string; data?: any }) => {
          if (tableId === 'game_recommendations') {
            recommendation = { ...pendingRow(), ...data };
          }
          return recommendation;
        },
      ),
      updateRow: jest.fn(
        async ({ tableId, data }: { tableId: string; data: any }) => {
          if (tableId === 'game_recommendations') {
            recommendation = { ...recommendation, ...data };
            return recommendation;
          }
          return {};
        },
      ),
    };
    const transactions = {
      runInTransaction: jest.fn(
        async (work: (ctx: { txId: string }) => Promise<unknown>) => {
          if (options.transactionFailure) throw options.transactionFailure;
          return work({
            txId: `tx-${transactions.runInTransaction.mock.calls.length}`,
          });
        },
      ),
    };
    const service = new GameRecommenderService(
      ai as never,
      candidates as never,
      { tablesDB } as never,
      transactions as never,
    );
    return {
      service,
      ai,
      candidates,
      tablesDB,
      transactions,
      getBalance: () => balance,
      getRecommendation: () => recommendation,
    };
  }

  it('faz uma única chamada estruturada, debita 5 e conclui a recomendação', async () => {
    const fixture = setup();
    fixture.ai.generate.mockResolvedValue({
      output: {
        gameId: 'game-1',
        reason: 'Combina com seu interesse recente em ação.',
        matchSignals: ['Gênero em comum', 'Boa avaliação'],
      },
    });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).resolves.toMatchObject({
      source: 'new',
      game: { id: 'game-1' },
      cost: 5,
      balance: 15,
    });
    expect(fixture.ai.generate).toHaveBeenCalledTimes(1);
    expect(fixture.ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.4',
        output: { schema: expect.anything() },
        abortSignal: expect.any(AbortSignal),
      }),
    );
    const prompt = fixture.ai.generate.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Priorize compatibilidade real de gameplay');
    expect(prompt).toContain(
      'arte, atmosfera, tema ou narrativa apenas como sinais secundários',
    );
    expect(prompt).toContain(
      'Não presuma que dois jogos têm gameplay, atmosfera ou estilo de arte semelhantes',
    );
    expect(prompt).toContain(
      'Se não houver uma conexão direta clara, retorne basedOnGameIds vazio',
    );
    expect(prompt).toContain(
      'A resposta deve parecer uma recomendação entre amigos',
    );
    expect(prompt).toContain(
      'Se Metal Slug Advance te divertiu, Blazing Chrome é uma ótima próxima escolha',
    );
    expect(prompt).toContain(
      'Nunca exponha IDs, nomes de campos, pontuações internas ou termos do sistema',
    );
    expect(fixture.getBalance()).toBe(15);
    expect(fixture.getRecommendation()).toMatchObject({
      state: 'completed',
      refunded: false,
      dailyKey: expect.stringMatching(/^gday_[a-f0-9]{31}$/),
    });
  });

  it('bloqueia uma sexta recomendação no mesmo dia antes de candidatos, cobrança ou IA', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T15:00:00.000Z'));
    try {
      const completed = {
        ...pendingRow(),
        $createdAt: '2026-09-09T12:00:00.000Z',
        state: 'completed' as const,
        gameId: game.id,
      };
      const fixture = setup();
      fixture.tablesDB.listRows
        .mockResolvedValueOnce({ total: 0, rows: [] })
        .mockResolvedValueOnce({
          total: 5,
          rows: Array.from({ length: 5 }, (_, i) => ({
            ...completed,
            $id: `existing-${i}`,
          })),
        });

      const request = fixture.service.suggest(
        'user-1',
        'new',
        'another-request',
      );

      await expect(request).rejects.toBeInstanceOf(HttpException);
      await expect(request).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GAME_RECOMMENDATION_DAILY_LIMIT',
          nextAvailableAt: '2026-09-10T03:00:00.000Z',
        }),
      });
      expect(fixture.candidates.build).not.toHaveBeenCalled();
      expect(fixture.transactions.runInTransaction).not.toHaveBeenCalled();
      expect(fixture.ai.generate).not.toHaveBeenCalled();
      expect(fixture.getBalance()).toBe(20);
    } finally {
      jest.useRealTimers();
    }
  });

  it('expõe evidências objetivas e proíbe afinidades vagas no prompt', async () => {
    const venba: RecommenderGame = {
      ...game,
      id: 'venba',
      name: 'Venba',
      slug: 'venba',
      genres: ['adventure', 'indie'],
    };
    const badNorth: RecommenderGame = {
      ...game,
      id: 'bad-north',
      name: 'Bad North',
      slug: 'bad-north',
      genres: ['strategy', 'indie'],
    };
    const fixture = setup();
    fixture.candidates.build.mockResolvedValue({
      ...context,
      signals: [
        {
          game: venba,
          status: 'completed',
          liked: true,
          likedEver: true,
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      ],
      candidates: [
        {
          game: badNorth,
          source: 'new',
          score: 8,
          basedOnGameIds: [venba.id],
        },
      ],
    });
    fixture.ai.generate.mockResolvedValue({
      output: {
        gameId: badNorth.id,
        reason: 'É uma opção popular e bem avaliada do catálogo.',
        matchSignals: ['Boa avaliação', 'Popularidade no catálogo'],
        basedOnGameIds: [],
      },
    });

    const result = await fixture.service.suggest('user-1', 'new', 'request-1');

    const prompt = fixture.ai.generate.mock.calls[0][0].prompt as string;
    const promptData = JSON.parse(prompt.split('\n').at(-1)!) as {
      candidates: Array<{
        id: string;
        affinities: unknown[];
      }>;
    };
    expect(prompt).toContain(
      'Não presuma que dois jogos têm gameplay, atmosfera ou estilo de arte semelhantes',
    );
    expect(prompt).toContain(
      'Se não houver uma conexão direta clara, retorne basedOnGameIds vazio',
    );
    expect(promptData.candidates).toEqual([
      expect.objectContaining({
        id: badNorth.id,
        affinities: [
          {
            basedOnGame: { id: venba.id, name: venba.name },
            sharedGenreIds: ['indie'],
            directlyRelated: false,
          },
        ],
      }),
    ]);
    expect(result.basedOnGames).toEqual([]);
    expect(fixture.getRecommendation().basedOnGameIds).toEqual([]);
  });

  it('rejeita justificativa que expõe o processo interno de seleção', async () => {
    const fixture = setup();
    fixture.ai.generate.mockResolvedValue({
      output: {
        gameId: game.id,
        reason:
          'Game One é a recomendação mais defensável por ter evidência de similaridade no catálogo.',
        matchSignals: ['Ação direta', 'Boa avaliação'],
        basedOnGameIds: [],
      },
    });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fixture.getRecommendation()).toMatchObject({
      state: 'failed',
      refunded: true,
      dailyKey: null,
    });
    expect(fixture.getBalance()).toBe(20);
  });

  it('rejeita ID técnico nos sinais exibidos ao usuário', async () => {
    const metalSlug = {
      ...game,
      id: 'igdb_1406',
      name: 'Metal Slug Advance',
    };
    const fixture = setup();
    fixture.candidates.build.mockResolvedValue({
      ...context,
      signals: [
        {
          game: metalSlug,
          status: 'completed',
          liked: true,
          likedEver: true,
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      ],
    });
    fixture.ai.generate.mockResolvedValue({
      output: {
        gameId: game.id,
        reason: 'Game One traz ação rápida e um ritmo arcade divertido.',
        matchSignals: ['Ação rápida', 'Lembra igdb_1406'],
        basedOnGameIds: [metalSlug.id],
      },
    });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fixture.getRecommendation()).toMatchObject({
      state: 'failed',
      refunded: true,
      dailyKey: null,
    });
  });

  it('respeita o override de modelo por variável de ambiente', async () => {
    const previousModel = process.env.GAME_RECOMMENDER_MODEL;
    process.env.GAME_RECOMMENDER_MODEL = 'openai/gpt-5.4-mini';
    try {
      const fixture = setup();
      fixture.ai.generate.mockResolvedValue({
        output: {
          gameId: 'game-1',
          reason: 'Combina com seu interesse recente em ação.',
          matchSignals: ['Gênero em comum', 'Boa avaliação'],
        },
      });

      await fixture.service.suggest('user-1', 'new', 'request-1');

      expect(fixture.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai/gpt-5.4-mini' }),
      );
    } finally {
      if (previousModel === undefined) {
        delete process.env.GAME_RECOMMENDER_MODEL;
      } else {
        process.env.GAME_RECOMMENDER_MODEL = previousModel;
      }
    }
  });

  it('não cobra nem chama a IA quando o saldo é insuficiente', async () => {
    const fixture = setup({ balance: 4 });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.ai.generate).not.toHaveBeenCalled();
    expect(fixture.transactions.runInTransaction).not.toHaveBeenCalled();
    expect(fixture.getBalance()).toBe(4);
  });

  it('rejeita jogo inventado e estorna uma única vez', async () => {
    const fixture = setup();
    fixture.ai.generate.mockResolvedValue({
      output: {
        gameId: 'outside-pool',
        reason: 'Uma justificativa que seria válida.',
        matchSignals: ['Sinal válido', 'Outro sinal'],
      },
    });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fixture.ai.generate).toHaveBeenCalledTimes(1);
    expect(fixture.getBalance()).toBe(20);
    expect(fixture.getRecommendation()).toMatchObject({
      state: 'failed',
      refunded: true,
      dailyKey: null,
    });
    const increments = fixture.tablesDB.createOperations.mock.calls.filter(
      ([call]) => call.operations[0].action === 'increment',
    );
    expect(increments).toHaveLength(1);
  });

  it('reproduz uma recomendação concluída sem candidatos, cobrança ou IA', async () => {
    const completed = {
      ...pendingRow(),
      gameId: 'game-1',
      source: 'new' as const,
      reason: 'Combina com seu interesse recente em ação.',
      matchSignals: ['Gênero em comum', 'Boa avaliação'],
      basedOnGameIds: [],
      state: 'completed' as const,
      generatedAt: '2026-09-09T00:00:02.000Z',
      balance: 15,
    };
    const fixture = setup({ existing: completed });

    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).resolves.toMatchObject({ id: completed.$id, game: { id: 'game-1' } });
    expect(fixture.candidates.build).not.toHaveBeenCalled();
    expect(fixture.ai.generate).not.toHaveBeenCalled();
    expect(fixture.transactions.runInTransaction).not.toHaveBeenCalled();
  });

  it('retorna conflito para a mesma chave ainda pending', async () => {
    const fixture = setup({ existing: pendingRow() });
    await expect(
      fixture.service.suggest('user-1', 'new', 'request-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.ai.generate).not.toHaveBeenCalled();
  });

  it('pagina histórico privado e carrega jogos em lote sem cobrança', async () => {
    const completed = {
      ...pendingRow(),
      gameId: game.id,
      source: 'new' as const,
      state: 'completed' as const,
      reason: 'Uma recomendação para você.',
      matchSignals: ['Ação', 'Avaliação'],
      basedOnGameIds: [],
      generatedAt: new Date().toISOString(),
      balance: 15,
    };
    const fixture = setup();
    fixture.tablesDB.listRows.mockResolvedValueOnce({
      total: 2,
      rows: [completed, { ...completed, $id: 'second' }],
    });
    const result = await fixture.service.history('user-1', 1);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(completed.$id);
    expect(fixture.tablesDB.listRows).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: expect.arrayContaining([
          JSON.stringify({
            method: 'equal',
            attribute: 'userId',
            values: ['user-1'],
          }),
          JSON.stringify({
            method: 'equal',
            attribute: 'state',
            values: ['completed'],
          }),
        ]),
      }),
    );
    expect(fixture.candidates.getGamesByIds).toHaveBeenCalledTimes(1);
    expect(fixture.ai.generate).not.toHaveBeenCalled();
    expect(fixture.transactions.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejeita cursor ausente ou de outro usuário antes de carregar jogos', async () => {
    const fixture = setup();
    await expect(
      fixture.service.history('user-1', 20, 'other-user-row'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.candidates.getGamesByIds).not.toHaveBeenCalled();
  });

  it('não estorna uma recomendação concluída durante a reconciliação', async () => {
    const completed = {
      ...pendingRow(),
      state: 'completed' as const,
      gameId: 'game-1',
    };
    const fixture = setup({ existing: completed });
    fixture.tablesDB.listRows.mockResolvedValueOnce({
      total: 1,
      rows: [completed],
    });

    await expect(
      fixture.service.reconcileAbandonedReservations(),
    ).resolves.toBe(0);
    expect(fixture.transactions.runInTransaction).not.toHaveBeenCalled();
  });
});
