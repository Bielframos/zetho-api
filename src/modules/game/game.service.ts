import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Query } from 'node-appwrite';
import type {
  Companies,
  Games as Game,
  ZEntriesReadOnly,
} from 'src/infra/appwrite/appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { IGDBService } from '../igdb/igdb.service';
import { SearchGamesDto, HypedUpcomingDto } from './game.dto';
import {
  extractKeywords,
  normalizeText,
  searchToken,
} from './game-search.utils';
import { GameMediaService } from './game-media.service';
import { GameMigrationsService } from './game-migrations.service';
import { GameSubscriptionsService } from './game-subscriptions.service';
import {
  buildGameSeoFlags,
  textReviewCountCacheKey,
  type GameSeoFlags,
} from './game-seo';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private static readonly DB_ID = 'app';

  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly igdbService: IGDBService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly media: GameMediaService,
    private readonly migrations: GameMigrationsService,
    private readonly subscriptions: GameSubscriptionsService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async searchCompanies(query = '') {
    const term = query.trim();
    const result = await this.tablesDB.listRows<Companies>({
      databaseId: GameService.DB_ID,
      tableId: 'companies',
      queries: [
        Query.select(['$id', 'name', 'slug']),
        Query.limit(20),
        Query.orderAsc('$id'),
        ...(term ? [Query.contains('name', term)] : []),
      ],
    });
    return {
      results: result.rows.map(({ $id, name, slug }) => ({ $id, name, slug })),
    };
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

    if (enrich) await this.migrations.upgrade(game);

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
        Query.select(['$id', 'gameId', '$updatedAt']),
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
          Query.select(['$id', 'slug']),
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
        ]),
        Query.orderDesc('hypes'),
        Query.orderAsc('releaseDate'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ],
    });

    const enrichedGames = await this.media.enrichCoverUrls(result.rows);
    const results = await this.attachZEntries(enrichedGames, dto.fingerprint);

    return {
      total: result.total,
      page,
      pageSize,
      pageCount: Math.ceil(result.total / pageSize),
      results,
    };
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

  findMediasBySlug(slug: string) {
    return this.media.findMediasBySlug(slug);
  }

  getEditorialImage(gameId: string) {
    return this.media.getEditorialImage(gameId);
  }

  findHeroImageBySlug(slug: string) {
    return this.media.findHeroImageBySlug(slug);
  }

  toggleNotifications(userId: string, gameId: string, active: boolean) {
    return this.subscriptions.setSubscription(userId, gameId, active);
  }
}
