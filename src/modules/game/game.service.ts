import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ID, Models, Query } from 'node-appwrite';
import type { Games as Game, ZEntriesReadOnly } from 'infra/appwrite';
import { GameMedias, GameMediasType } from 'infra/appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBService } from '../igdb/igdb.service';
import { SearchGamesDto, HypedUpcomingDto } from './game.dto';
import { extractKeywords, slugify, calculateScore } from './game-search.utils';
import { TranslatorService } from 'src/common/ai/translator.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly currentVersion = 2;

  private games: Appwrite['databases']['games'];
  private gameMedias: Appwrite['databases']['gameMedias'];
  private tablesDB: Appwrite['databases']['api'];
  private zEntriesReadonly: Appwrite['databases']['zEntriesReadonly'];

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
    this.games = this.appwrite.databases.games;
    this.gameMedias = this.appwrite.databases.gameMedias;
    this.tablesDB = this.appwrite.databases.api;
    this.zEntriesReadonly = this.appwrite.databases.zEntriesReadonly;
  }

  async findBySlug(slug: string, select?: string, { enrich = true } = {}) {
    const cacheKey = `game:slug:${slug}:${select ?? ''}`;
    const cached = await this.cache.get<Game>(cacheKey);
    if (cached) return cached;

    const requestedFields = select
      ? (select
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean) as string[])
      : null;

    // Sempre inclui campos internos necessários para enriquecimento e migração
    const internalFields = ['syncStage', 'externalReference', 'zethoVersion'];

    const queryFields = requestedFields
      ? ([...new Set([...requestedFields, ...internalFields])] as any[])
      : undefined;

    const result = await this.games.list({
      queries: (q) => [
        q.equal('slug', slug),
        q.limit(1),
        ...(queryFields?.length ? [q.select(queryFields)] : []),
      ],
    });

    let game = result.rows[0];

    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    // Se o jogo não está totalmente sincronizado, enriquece agora
    if (enrich && game.syncStage !== 'full') {
      await this.igdbService.importGameById(game.externalReference);
      const enrichedResult = await this.games.list({
        queries: (q) => [
          q.equal('slug', slug),
          q.limit(1),
          ...(queryFields?.length ? [q.select(queryFields)] : []),
        ],
      });
      game = enrichedResult.rows[0] ?? game;
    }

    const version = game.zethoVersion ?? 0;
    if (version < this.currentVersion) {
      await this.applyMigrations(game);
    }

    await this.cache.set(cacheKey, game);
    return game;
  }

  async search(dto: SearchGamesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 12;
    const q = dto.q?.trim();
    const keywords = q ? extractKeywords(q) : [];
    const hasFilters = !!(dto.genre || dto.year);
    const shouldSearch = (q && q.length >= 3) || hasFilters;

    const gameFields = [
      '$id',
      'name',
      'slug',
      'coverUrl',
      'releaseYear',
    ] as const;

    let exactMatch: Game | null = null;

    // Busca exata por slug (somente na primeira página e se q existir)
    if (q && page === 1) {
      const slugQuery = slugify(q);
      const exactResult = await this.games.list({
        queries: (qb) => [
          qb.equal('slug', slugQuery),
          qb.select([...gameFields, 'syncStage', 'externalReference'] as any),
          qb.limit(1),
        ],
      });
      exactMatch = exactResult.rows[0] ?? null;
    }

    let criteriaResults: Game[] = [];
    let total = exactMatch ? 1 : 0;

    if (shouldSearch) {
      const criteriaResult = await this.games.list({
        queries: (qb) => {
          const conditions: string[] = [];

          for (const kw of keywords) {
            conditions.push(qb.contains('slug', kw as any));
          }

          if (dto.genre) {
            conditions.push(qb.contains('genres' as any, dto.genre as any));
          }

          if (dto.year) {
            conditions.push(qb.equal('releaseYear', dto.year));
          }

          if (exactMatch) {
            conditions.push(qb.notEqual('slug', exactMatch.slug));
          }

          const baseQueries: string[] = [
            qb.select([...gameFields, 'syncStage', 'externalReference'] as any),
            qb.limit(pageSize),
            qb.offset((page - 1) * pageSize),
          ];

          if (conditions.length > 1) baseQueries.unshift(qb.and(...conditions));
          else baseQueries.unshift(conditions[0]);

          return baseQueries;
        },
      });

      criteriaResults = criteriaResult.rows;
      total = criteriaResult.total + (exactMatch ? 1 : 0);
    }

    // Mesclar e ordenar por score
    const allGames = exactMatch
      ? [exactMatch, ...criteriaResults]
      : criteriaResults;

    const scored = allGames.map((game) => ({
      game,
      score: q
        ? calculateScore({
            gameSlug: game.slug,
            gameName: game.name,
            query: q,
            keywords,
          })
        : 0,
    }));

    scored.sort((a, b) => b.score - a.score);

    const enrichedGames = await this.enrichBasicCoverUrls(
      scored.map((s) => s.game),
    );

    const results = await this.attachZEntries(enrichedGames, dto.fingerprint);

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

    const result = await this.games.list({
      queries: (q) => [
        q.greaterThan('releaseDate', new Date().toISOString() as any),
        q.greaterThanEqual('hypes', 35 as any),
        q.select([
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
        q.orderDesc('hypes'),
        q.orderAsc('releaseDate'),
        q.limit(pageSize),
        q.offset((page - 1) * pageSize),
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

    const gameResult = await this.games.list({
      queries: (q) => [q.equal('slug', slug), q.limit(1), q.select(['$id'])],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.gameMedias.list({
      queries: (q) => [q.equal('game' as any, game.$id as any)],
    });

    const response = this.buildMediaDtos(mediasResult.rows);
    await this.cache.set(cacheKey, response);
    return response;
  }

  async getRandomScreenshot(gameId: string) {
    const mediasResult = await this.tablesDB.listRows({
      databaseId: 'app',
      tableId: 'game_medias',
      queries: [
        Query.equal('game' as any, gameId as any),
        Query.equal('type', GameMediasType.SCREENSHOT),
        Query.limit(1),
        Query.orderRandom(),
      ],
    });

    const screenshot = mediasResult.rows[0];

    if (!screenshot) {
      throw new NotFoundException(
        `Nenhum screenshot encontrado para jogo ${gameId}`,
      );
    }

    return this.buildImageUrl('screenshot_big', screenshot.mediaId);
  }

  async findHeroImageBySlug(slug: string) {
    const cacheKey = `game:hero:${slug}`;
    const cached = await this.cache.get<{ url: string; type: string }>(
      cacheKey,
    );
    if (cached) return cached;

    const gameResult = await this.games.list({
      queries: (q) => [q.equal('slug', slug), q.limit(1), q.select(['$id'])],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.gameMedias.list({
      queries: (q) => [q.equal('game' as any, game.$id as any)],
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

        return this.games.update(game.$id, { coverUrl });
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
      const migration = this.migrations[v as keyof typeof this.migrations];
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

        await this.games.update(
          game.$id,
          { summaryPt: translatedSummary, zethoVersion: 2 },
          { transactionId: tx.$id },
        );

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

    const entriesResult = await this.zEntriesReadonly.list({
      queries: (q) => [
        q.equal('ownerFingerprint', fingerprint),
        q.equal('gameId', gameIds as any),
        q.select(['gameId', 'status', 'liked', 'hyped']),
        q.limit(gameIds.length),
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
}
