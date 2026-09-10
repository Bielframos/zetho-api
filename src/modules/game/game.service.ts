import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ID, Models, Query, MessagingProviderType } from 'node-appwrite';
import type {
  GameMedias,
  Games as Game,
  ZEntriesReadOnly,
} from 'src/infra/appwrite/appwrite';
import { GameMediasType } from 'src/infra/appwrite/appwrite.enums';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { IGDBService } from '../igdb/igdb.service';
import { SearchGamesDto, HypedUpcomingDto } from './game.dto';
import {
  extractKeywords,
  normalizeText,
  searchToken,
} from './game-search.utils';
import { TranslatorService } from 'src/agents/translator/translator.service';
import {
  buildGameSeoFlags,
  textReviewCountCacheKey,
  type GameSeoFlags,
} from './game-seo';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly currentVersion = 2;
  private static readonly DB_ID = 'app';

  private readonly tablesDB: Appwrite['tablesDB'];

  /** In-process migration locks: prevents duplicate concurrent migrations */
  private readonly migrationPromises = new Map<string, Promise<void>>();

  private static readonly IGDB_IMAGE_BASE =
    'https://images.igdb.com/igdb/image/upload';

  constructor(
    private readonly appwrite: Appwrite,
    private readonly translatorService: TranslatorService,
    private readonly igdbService: IGDBService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async findBySlug(slug: string, select?: string, { enrich = true } = {}) {
    const cacheKey = `game:slug:${slug}:${select ?? ''}:${enrich}`;
    const cached = await this.cache.get<Game>(cacheKey);
    if (cached && (!enrich || cached.syncStage === 'full'))
      return {
        ...this.withoutSearchIndex(cached),
        seo: await this.getSeoFlags(cached.$id),
      };

    const requestedFields = select
      ? select
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
      : null;

    // Sempre inclui campos internos necessários para enriquecimento e migração
    const internalFields = ['syncStage', 'externalReference', 'zethoVersion'];

    const queryFields = requestedFields
      ? ([...new Set([...requestedFields, ...internalFields])] as any[])
      : undefined;

    const result = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('slug', slug),
        Query.limit(1),
        ...(queryFields?.length ? [Query.select(queryFields)] : []),
      ],
    });

    let game = result.rows[0];

    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    // Se o jogo não está totalmente sincronizado, enriquece agora
    if (enrich && game.syncStage !== 'full') {
      await this.igdbService.importGameById(game.externalReference);
      const enrichedResult = await this.tablesDB.listRows<Game>({
        databaseId: GameService.DB_ID,
        tableId: 'games',
        queries: [
          Query.equal('slug', slug),
          Query.limit(1),
          ...(queryFields?.length ? [Query.select(queryFields)] : []),
        ],
      });
      game = enrichedResult.rows[0] ?? game;
    }

    const version = game.zethoVersion ?? 0;
    if (enrich && version < this.currentVersion) {
      await this.applyMigrations(game);
    }

    const publicGame = this.withoutSearchIndex(game);
    await this.cache.set(cacheKey, publicGame);

    // Fora do payload cacheado de propósito: `seo` muda quando alguém escreve
    // uma review, e o cache do jogo é chaveado por slug+select — não daria
    // para invalidá-lo a partir do RatingsService. `countTextReviews` tem o
    // próprio cache, invalidável por gameId.
    return { ...publicGame, seo: await this.getSeoFlags(game.$id) };
  }

  private withoutSearchIndex(game: Game) {
    const {
      searchText: _text,
      searchName: _name,
      searchIndexVersion: _version,
      ...publicGame
    } = game;
    return publicGame;
  }

  /**
   * Conta reviews com corpo de texto de um jogo.
   *
   * Depende do índice `ratings_gameId`. Sem ele, cada chamada varre a tabela
   * inteira — e essa contagem entra no caminho de render de toda página de
   * jogo.
   */
  async countTextReviews(gameId: string): Promise<number> {
    const cacheKey = textReviewCountCacheKey(gameId);
    const cached = await this.cache.get<number>(cacheKey);
    if (typeof cached === 'number') return cached;

    try {
      const response = await this.tablesDB.listRows({
        databaseId: GameService.DB_ID,
        tableId: 'ratings',
        queries: [
          Query.equal('gameId', gameId),
          Query.isNotNull('content'),
          Query.notEqual('content', ''),
          Query.limit(1),
          Query.select(['$id'] as any),
        ],
      });

      await this.cache.set(cacheKey, response.total);
      return response.total;
    } catch (error) {
      // Indisponibilidade da contagem não pode derrubar a página do jogo.
      // Degrada para 0 = não indexável, que é o lado seguro: uma página sem
      // conteúdo original nunca deveria entrar no índice.
      this.logger.warn(
        `Falha ao contar reviews com texto do jogo ${gameId}: ${String(error)}`,
      );
      return 0;
    }
  }

  async getSeoFlags(gameId: string): Promise<GameSeoFlags> {
    return buildGameSeoFlags(await this.countTextReviews(gameId));
  }

  /** Chamado pelo RatingsService quando uma review é criada, editada ou removida. */
  async invalidateTextReviewCount(gameId: string) {
    await this.cache.del(textReviewCountCacheKey(gameId));
  }

  /**
   * Enumera os jogos indexáveis para o sitemap.
   *
   * Dirigido pela tabela `ratings` (pequena) e não por `games` (dezenas de
   * milhares): só é indexável quem tem review com texto, então varrer o
   * catálogo inteiro seria varrer quase só descarte.
   *
   * Usa `cursorAfter` e nunca `offset` — no Appwrite o offset degrada e trava
   * por volta de 5000 linhas, que é a razão do teto rígido em
   * `getPostsForSitemap`.
   */
  async listIndexableGames(): Promise<
    Array<{ slug: string; lastmod: string }>
  > {
    const lastReviewByGame = new Map<string, string>();
    let cursor: string | undefined;

    for (;;) {
      const queries = [
        Query.isNotNull('content'),
        Query.notEqual('content', ''),
        Query.orderAsc('$id'),
        Query.limit(500),
        Query.select(['$id', 'gameId', '$updatedAt'] as any),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.tablesDB.listRows<any>({
        databaseId: GameService.DB_ID,
        tableId: 'ratings',
        queries,
      });

      for (const row of page.rows) {
        const previous = lastReviewByGame.get(row.gameId);
        if (!previous || row.$updatedAt > previous) {
          lastReviewByGame.set(row.gameId, row.$updatedAt);
        }
      }

      if (page.rows.length < 500) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }

    if (lastReviewByGame.size === 0) return [];

    const gameIds = [...lastReviewByGame.keys()];
    const entries: Array<{ slug: string; lastmod: string }> = [];

    // Resolve slugs em lotes: `Query.equal` aceita lista de valores.
    const batchSize = 100;
    for (let i = 0; i < gameIds.length; i += batchSize) {
      const batch = gameIds.slice(i, i + batchSize);
      const games = await this.tablesDB.listRows<Game>({
        databaseId: GameService.DB_ID,
        tableId: 'games',
        queries: [
          Query.equal('$id', batch),
          Query.limit(batch.length),
          Query.select(['$id', 'slug'] as any),
        ],
      });

      for (const game of games.rows) {
        if (!game.slug) continue;
        entries.push({
          slug: game.slug,
          lastmod: lastReviewByGame.get(game.$id) ?? game.$updatedAt,
        });
      }
    }

    return entries;
  }

  /**
   * Busca um jogo pelo $id. Usado para resolver dados leves (nome/slug) de
   * jogos já vinculados por id, sem enriquecimento pesado.
   */
  async findById(id: string, select?: string): Promise<Game> {
    const requestedFields = select
      ? (select
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean) as any[])
      : undefined;

    const result = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('$id', id),
        Query.limit(1),
        ...(requestedFields?.length ? [Query.select(requestedFields)] : []),
      ],
    });

    const game = result.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com id "${id}" não encontrado`);
    }

    return game;
  }

  async search(dto: SearchGamesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 12;
    const q = normalizeText(dto.q ?? '');
    const filters: string[] = [];
    if (dto.genre) filters.push(Query.contains('genres', [dto.genre]));
    if (dto.year) filters.push(Query.equal('releaseYear', dto.year));
    if (dto.developer)
      filters.push(
        Query.search('searchText', searchToken(`developer:${dto.developer}`)),
      );
    if (dto.publisher)
      filters.push(
        Query.search('searchText', searchToken(`publisher:${dto.publisher}`)),
      );
    const empty = { total: 0, page, pageSize, pageCount: 0, results: [] };
    if (!q && (!filters.length || dto.q?.trim())) return empty;

    const fields = Query.select([
      '$id',
      'name',
      'slug',
      'coverUrl',
      'releaseYear',
    ]);
    const list = (conditions: string[], limit: number, offset: number) =>
      this.tablesDB.listRows<Game>({
        databaseId: GameService.DB_ID,
        tableId: 'games',
        queries: [
          ...filters,
          ...conditions,
          fields,
          Query.orderAsc('searchName'),
          Query.orderAsc('$id'),
          Query.limit(limit),
          Query.offset(offset),
        ],
      });
    const offset = (page - 1) * pageSize;
    let rows: Game[];
    let total: number;
    if (q) {
      // Two disjoint tiers: exact titles first, then token/alias matches.
      // Each tier is globally ordered; offsets include the size of the first.
      const exact = await list(
        [Query.equal('searchName', q)],
        pageSize,
        offset,
      );
      const remaining = pageSize - exact.rows.length;
      const matches = extractKeywords(q).map((token) =>
        Query.search('searchText', searchToken(token)),
      );
      const other = await list(
        [Query.notEqual('searchName', q), ...matches],
        Math.max(1, remaining),
        Math.max(0, offset - exact.total),
      );
      total = exact.total + other.total;
      rows = [...exact.rows, ...(remaining ? other.rows : [])];
    } else {
      const result = await list([], pageSize, offset);
      rows = result.rows;
      total = result.total;
    }
    // Searching is read-only: covers are populated by ingestion.
    const results = await this.attachZEntries(rows, dto.fingerprint);
    return {
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
      results,
    };
  }

  async findHypedUpcoming(dto: HypedUpcomingDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 12;

    const result = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.greaterThan('releaseDate', new Date().toISOString() as any),
        Query.greaterThanEqual('hypes', 35 as any),
        Query.select([
          '$id',
          'name',
          'slug',
          'coverUrl',
          'releaseYear',
          'releaseDate',
          'hypes',
          'syncStage',
          'externalReference',
        ] as any),
        Query.orderDesc('hypes'),
        Query.orderAsc('releaseDate'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ],
    });

    const enrichedGames = await this.enrichBasicCoverUrls(result.rows);
    const results = await this.attachZEntries(enrichedGames, dto.fingerprint);

    return {
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
      results,
    };
  }

  async findMediasBySlug(slug: string) {
    const cacheKey = `game:medias:${slug}`;
    const cached =
      await this.cache.get<ReturnType<typeof this.buildMediaDtos>>(cacheKey);
    if (cached) return cached;

    const gameResult = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('slug', slug),
        Query.limit(1),
        Query.select(['$id']),
      ],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game' as any, game.$id as any)],
    });

    const response = this.buildMediaDtos(mediasResult.rows);
    await this.cache.set(cacheKey, response);
    return response;
  }

  /**
   * Resolve a melhor imagem editorial disponível para um jogo, em cascata:
   * screenshot aleatório → key art → coverUrl (IGDB). Retorna `null` quando o
   * jogo não possui nenhuma imagem, deixando o chamador decidir o fallback
   * genérico (ex.: Unsplash). Não lança exceção por ausência de mídia.
   */
  async getEditorialImage(
    gameId: string,
  ): Promise<{ url: string; type: 'screenshot' | 'keyart' | 'cover' } | null> {
    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game' as any, gameId as any)],
    });

    const screenshots = mediasResult.rows.filter(
      (m) => m.type === GameMediasType.SCREENSHOT,
    );
    if (screenshots.length) {
      const pick = screenshots[Math.floor(Math.random() * screenshots.length)];
      return {
        url: this.buildImageUrl('screenshot_big', pick.mediaId),
        type: 'screenshot',
      };
    }

    const artwork = mediasResult.rows.find(
      (m) => m.type === GameMediasType.KEY_ART,
    );
    if (artwork) {
      return {
        url: this.buildImageUrl('1080p', artwork.mediaId),
        type: 'keyart',
      };
    }

    const game = await this.findById(gameId, '$id,coverUrl').catch(() => null);
    if (game?.coverUrl) {
      return { url: game.coverUrl, type: 'cover' };
    }

    return null;
  }

  async findHeroImageBySlug(slug: string) {
    const cacheKey = `game:hero:${slug}`;
    const cached = await this.cache.get<{ url: string; type: string }>(
      cacheKey,
    );
    if (cached) return cached;

    const gameResult = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('slug', slug),
        Query.limit(1),
        Query.select(['$id']),
      ],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game' as any, game.$id as any)],
    });

    const artwork = mediasResult.rows.find(
      (m) => m.type === GameMediasType.KEY_ART,
    );

    if (artwork) {
      const response = {
        url: this.buildImageUrl('1080p', artwork.mediaId),
        type: GameMediasType.KEY_ART,
      };
      await this.cache.set(cacheKey, response);
      return response;
    }

    const screenshot = mediasResult.rows.find(
      (m) => m.type === GameMediasType.SCREENSHOT,
    );

    if (screenshot) {
      const response = {
        url: this.buildImageUrl('1080p', screenshot.mediaId),
        type: GameMediasType.SCREENSHOT,
      };
      await this.cache.set(cacheKey, response);
      return response;
    }

    throw new NotFoundException(
      `Nenhuma imagem hero encontrada para "${slug}"`,
    );
  }

  private buildMediaDtos(medias: GameMedias[]) {
    return medias.map((m) => {
      if (m.type === GameMediasType.KEY_ART) {
        return { ...m, url: this.buildImageUrl('1080p', m.mediaId) };
      }
      if (m.type === GameMediasType.SCREENSHOT) {
        return { ...m, url: this.buildImageUrl('screenshot_big', m.mediaId) };
      }
      // VIDEO
      return { ...m, url: `https://www.youtube.com/watch?v=${m.mediaId}` };
    });
  }

  private async enrichBasicCoverUrls(games: Game[]) {
    const basicGames = games.filter(
      (game) => game.syncStage === 'basic' && !game.coverUrl,
    );

    if (!basicGames.length) {
      return games;
    }

    const externalIds = basicGames.map((game) => game.externalReference);
    const igdbGames = await this.igdbService.getGamesByIds(
      externalIds,
      externalIds.length,
    );

    const coverMap = new Map<number, string>();
    for (const igdbGame of igdbGames) {
      if (igdbGame.cover?.image_id) {
        coverMap.set(
          igdbGame.id,
          `https://images.igdb.com/igdb/image/upload/t_cover_big/${igdbGame.cover.image_id}.jpg`,
        );
      }
    }

    const updates = basicGames
      .map((game) => {
        const coverUrl = coverMap.get(game.externalReference);
        if (!coverUrl) {
          return null;
        }

        return this.tablesDB.updateRow<Game>({
          databaseId: GameService.DB_ID,
          tableId: 'games',
          rowId: game.$id,
          data: { coverUrl },
        });
      })
      .filter((operation): operation is Promise<Game> => operation !== null);

    await Promise.all(updates);

    return games.map((game) => {
      if (game.coverUrl) {
        return game;
      }

      const coverUrl = coverMap.get(game.externalReference);
      return coverUrl ? { ...game, coverUrl } : game;
    });
  }

  private buildImageUrl(size: string, hash: string) {
    return `${GameService.IGDB_IMAGE_BASE}/t_${size}/${hash}.jpg`;
  }

  private async applyMigrations(game: Game): Promise<void> {
    const gameId = game.$id;

    const existing = this.migrationPromises.get(gameId);
    if (existing) {
      await existing;
      return;
    }

    const promise = this.runMigrations(game).finally(() => {
      this.migrationPromises.delete(gameId);
    });

    this.migrationPromises.set(gameId, promise);
    await promise;
  }

  private async runMigrations(game: Game): Promise<void> {
    const startVersion = game.zethoVersion ?? 0;

    for (let v = startVersion + 1; v <= this.currentVersion; v++) {
      const migration = this.migrations[v];
      if (migration) {
        this.logger.log(`Aplicando migração v${v} para jogo ${game.$id}`);
        await migration(game);
      }
    }
  }

  private readonly migrations: Record<number, (game: Game) => Promise<void>> = {
    1: (game) => this.mediasMigration(game),
    2: (game) => this.translateDescriptionsMigration(game),
  };

  private async mediasMigration(game: Game): Promise<void> {
    const igdbId = game.externalReference;

    const mediaData = await this.igdbService.fetchGameMedias(igdbId);

    const artworkOps =
      mediaData?.artworks
        ?.filter((a) => a.artwork_type === 2)
        .map((a) => ({
          action: 'create' as const,
          databaseId: 'app',
          tableId: 'game_medias',
          rowId: ID.unique(),
          data: {
            game: game.$id,
            type: GameMediasType.KEY_ART,
            mediaId: a.image_id,
          },
        })) ?? [];

    const screenshotOps =
      mediaData?.screenshots?.map((s) => ({
        action: 'create' as const,
        databaseId: 'app',
        tableId: 'game_medias',
        rowId: ID.unique(),
        data: {
          game: game.$id,
          type: GameMediasType.SCREENSHOT,
          mediaId: s.image_id,
        },
      })) ?? [];

    const videoOps =
      mediaData?.videos?.map((v) => ({
        action: 'create' as const,
        databaseId: 'app',
        tableId: 'game_medias',
        rowId: ID.unique(),
        data: {
          game: game.$id,
          type: GameMediasType.VIDEO,
          mediaId: v.video_id,
          name: v.name,
        },
      })) ?? [];

    const versionBumpOp = {
      action: 'update' as const,
      databaseId: 'app',
      tableId: 'games',
      rowId: game.$id,
      data: { zethoVersion: 1 },
    };

    let tx: Models.Transaction | null = null;

    try {
      tx = await this.tablesDB.createTransaction();

      const operations = [
        ...artworkOps,
        ...screenshotOps,
        ...videoOps,
        versionBumpOp,
      ];

      await this.tablesDB.createOperations({
        transactionId: tx.$id,
        operations,
      });

      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        commit: true,
      });

      this.logger.log(`Migração de mídias concluída para jogo ${game.$id}`);
    } catch (err) {
      if (tx?.$id) {
        await this.tablesDB.updateTransaction({
          transactionId: tx.$id,
          rollback: true,
        });
      }
      throw err;
    }
  }

  /** Traduz descrições dos jogos para pt-BR */
  private async translateDescriptionsMigration(game: Game): Promise<void> {
    const summary = game.summary;
    let translatedSummary: string | null = null;

    if (summary) {
      try {
        translatedSummary = await this.translatorService.translate(summary);
        const tx = await this.tablesDB.createTransaction();

        await this.tablesDB.updateRow({
          databaseId: GameService.DB_ID,
          tableId: 'games',
          rowId: game.$id,
          data: { summaryPt: translatedSummary, zethoVersion: 2 },
          transactionId: tx.$id,
        });

        await this.tablesDB.updateTransaction({
          transactionId: tx.$id,
          commit: true,
        });

        game.zethoVersion = 2;
        game.summaryPt = translatedSummary;

        this.logger.log(`Migração de tradução concluída para jogo ${game.$id}`);
      } catch (e) {
        this.logger.error(`Erro ao migrar tradução para jogo ${game.$id}`, e);
      }
    }
    return;
  }

  /**
   * Anexa o zEntry do usuário (via fingerprint) a cada jogo da lista.
   * Retorna null se o fingerprint não for informado ou o entry não existir.
   */
  private async attachZEntries(
    games: Pick<Game, '$id' | 'name' | 'slug' | 'coverUrl' | 'releaseYear'>[],
    fingerprint?: string,
  ) {
    if (!fingerprint || games.length === 0) {
      return games.map((g) => ({ ...g, zEntry: null }));
    }

    const gameIds = games.map((g) => g.$id);

    const entriesResult = await this.tablesDB.listRows<ZEntriesReadOnly>({
      databaseId: GameService.DB_ID,
      tableId: 'z_entries_read',
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.equal('gameId', gameIds as any),
        Query.select(['gameId', 'status', 'liked', 'hyped']),
        Query.limit(gameIds.length),
      ],
    });

    const entryMap = new Map<string, ZEntriesReadOnly>(
      entriesResult.rows.map((e) => [e.gameId, e]),
    );

    return games.map((g) => ({
      ...g,
      zEntry: entryMap.get(g.$id) ?? null,
    }));
  }

  async toggleNotifications(userId: string, gameId: string, active: boolean) {
    const topicId = `game_${gameId}`;

    // 1. Obter targets de E-mail do usuário
    const targetsList = await this.appwrite.users.listTargets({ userId });
    let emailTargets = targetsList.targets.filter(
      (target) => target.providerType === 'email',
    );

    // Fallback: Se o usuário tiver e-mail mas não tiver target de e-mail registrado
    if (emailTargets.length === 0) {
      const user = await this.appwrite.users.get({ userId });
      if (user.email) {
        const newTarget = await this.appwrite.users.createTarget({
          userId,
          targetId: ID.unique(),
          providerType: MessagingProviderType.Email,
          identifier: user.email,
        });
        emailTargets = [newTarget];
      }
    }

    if (emailTargets.length === 0) {
      return {
        success: false,
        message: 'Nenhum endereço de e-mail cadastrado ou disponível.',
      };
    }

    if (active) {
      // 2. Garantir que o tópico existe no Appwrite (Criação sob demanda)
      try {
        await this.appwrite.messaging.getTopic({ topicId });
      } catch (error: any) {
        if (error.code === 404) {
          // Buscar nome do jogo para exibir no console do Appwrite
          const game = await this.tablesDB.getRow<any>({
            databaseId: 'app',
            tableId: 'games',
            rowId: gameId,
          });
          await this.appwrite.messaging.createTopic({
            topicId,
            name: `Novidades: ${game.name}`,
          });
        } else {
          throw error;
        }
      }

      // 3. Inscrever os targets de e-mail do usuário no tópico
      for (const target of emailTargets) {
        const subscriberId = crypto
          .createHash('md5')
          .update(`${target.$id}_${topicId}`)
          .digest('hex');

        try {
          await this.appwrite.messaging.createSubscriber({
            topicId,
            subscriberId,
            targetId: target.$id,
          });
        } catch (error: any) {
          // Ignorar se já estiver inscrito
          if (error.code !== 409) throw error;
        }
      }
    } else {
      // 4. Cancelar inscrição dos targets de e-mail
      for (const target of emailTargets) {
        const subscriberId = crypto
          .createHash('md5')
          .update(`${target.$id}_${topicId}`)
          .digest('hex');

        try {
          await this.appwrite.messaging.deleteSubscriber({
            topicId,
            subscriberId,
          });
        } catch (error: any) {
          // Ignorar se não estava cadastrado
          if (error.code !== 404) throw error;
        }
      }
    }

    return { success: true };
  }
}
