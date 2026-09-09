import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { IGDBGame, IGDBGameMedia, IGDBGenre } from './igdb.types';
import { AppwriteException, ID, Models, Query } from 'node-appwrite';
import type { GamesCreate } from 'src/infra/appwrite/appwrite-custom.types';
import {
  classifyHttpError,
  executeWithRetry,
  IntegrationExecutionError,
} from 'src/common/integration/retry-policy';
import { CorrelationContextService } from 'src/common/observability/correlation-context.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { IGDBCoordinationService } from './igdb-coordination.service';
import { IGDBUpsertService } from './igdb-upsert.service';

@Injectable()
export class IGDBService {
  private readonly logger = new Logger(IGDBService.name);
  private static readonly DB_ID = 'app';
  private tableDB: Appwrite['tablesDB'];

  private authPromise: Promise<string> | null = null;

  constructor(
    private appwrite: Appwrite,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly coordinationService: IGDBCoordinationService,
    private readonly upsertService: IGDBUpsertService,
  ) {
    this.tableDB = this.appwrite.tablesDB;
  }

  private async getToken(): Promise<string> {
    if (this.authPromise) {
      return this.authPromise;
    }

    const cachedToken = await this.coordinationService.getCachedToken();
    if (cachedToken) {
      return cachedToken;
    }

    this.authPromise = this.authenticate();

    try {
      const token = await this.authPromise;
      return token;
    } finally {
      this.authPromise = null;
    }
  }

  private async authenticate(): Promise<string> {
    this.logger.log(
      this.loggerContext.buildStructuredLog({
        component: IGDBService.name,
        operation: 'igdb.authenticate',
        message: 'Gerando novo token IGDB via Twitch...',
      }),
    );

    const url = new URL('https://id.twitch.tv/oauth2/token');

    url.search = new URLSearchParams({
      client_id: process.env.IGDB_CLIENT_ID as string,
      client_secret: process.env.IGDB_CLIENT_SECRET as string,
      grant_type: 'client_credentials',
    }).toString();

    const response = await executeWithRetry({
      provider: 'twitch',
      operation: 'oauth.token',
      timeoutMs: 8_000,
      maxRetries: 2,
      run: async (signal) => {
        const res = await fetch(url, { method: 'POST', signal });

        if (!res.ok) {
          throw { status: res.status, message: await res.text() };
        }

        return res;
      },
      classifyError: (error) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            retryable: true,
            terminalStatusCode: 504,
            reason: 'timeout',
          };
        }

        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof (error as { status?: unknown }).status === 'number'
        ) {
          const status = (error as { status: number }).status;
          return {
            retryable: status === 429 || status >= 500,
            terminalStatusCode: status,
            reason:
              status >= 400 && status < 500 ? 'http_4xx' : 'http_5xx_or_429',
          };
        }

        return classifyHttpError(error);
      },
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        'Falha ao autenticar na Twitch/IGDB',
      );
    }

    const data = await response.json();

    await this.coordinationService.cacheToken(
      data.access_token,
      data.expires_in,
    );

    return data.access_token;
  }

  private async fetchIgdb(endpoint: string, body: string) {
    await this.coordinationService.applyRateLimit();

    const token = await this.getToken();

    try {
      const response = await executeWithRetry({
        provider: 'igdb',
        operation: endpoint,
        timeoutMs: 10_000,
        maxRetries: 2,
        run: async (signal) => {
          const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
            method: 'POST',
            headers: {
              'Client-ID': process.env.IGDB_CLIENT_ID as string,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'text/plain',
            },
            body,
            signal,
          });

          if (!res.ok) {
            throw { status: res.status, message: await res.text() };
          }

          return res;
        },
        classifyError: (error) => {
          if (error instanceof Error && error.name === 'AbortError') {
            return {
              retryable: true,
              terminalStatusCode: 504,
              reason: 'timeout',
            };
          }

          if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof (error as { status?: unknown }).status === 'number'
          ) {
            const status = (error as { status: number }).status;
            return {
              retryable: status === 429 || status >= 500,
              terminalStatusCode: status,
              reason:
                status >= 400 && status < 500 ? 'http_4xx' : 'http_5xx_or_429',
            };
          }

          return classifyHttpError(error);
        },
      });

      return await response.json();
    } catch (error) {
      if (error instanceof IntegrationExecutionError) {
        this.logger.error(
          this.loggerContext.buildStructuredLog({
            component: IGDBService.name,
            operation: 'igdb.fetch',
            message: 'Falha em integração IGDB',
            provider: error.provider,
            integrationOperation: error.operation,
            retryable: error.retryable,
            terminalStatusCode: error.terminalStatusCode,
            attempts: error.attempts,
            reason: error.reason,
            error: this.loggerContext.serializeError(error),
          }),
        );
      }

      throw new InternalServerErrorException('IGDB Error');
    }
  }

  private gameFields =
    'name,slug,status,game_status,game_type,summary,cover.image_id,first_release_date,hypes,follows,similar_games,checksum,genres,involved_companies.company,involved_companies.developer,involved_companies.company.name,involved_companies.company.slug,involved_companies.company.checksum';

  async getGames(limit = 50, offset = 0) {
    const query = `
      fields ${this.gameFields};
      where rating >= 48 & version_parent = null & game_type != (3,5,7,12,13,14);
      limit ${limit};
      offset ${offset};
    `;
    return await this.fetchIgdb('games', query);
  }

  async syncPopularGames() {
    const run = () =>
      this.loggerContext.trackLifecycle(
        this.logger,
        {
          component: IGDBService.name,
          operation: 'igdb.sync-popular-games',
        },
        async () => {
          const query = `
      fields ${this.gameFields};
      where first_release_date > 1777030000 & hypes != null & version_parent = null & game_type != (3,5,7,12,13,14);
      sort hypes desc;
      limit 50;
    `;

          const popularGames = (await this.fetchIgdb(
            'games',
            query,
          )) as IGDBGame[];
          const eligibleGames = popularGames.filter(
            (game) => !this.shouldIgnore(game),
          );

          const existingByExternalReference =
            await this.getExistingGamesByExternalReference(
              eligibleGames.map((game) => game.id),
            );

          const processedGames = await this.mapWithConcurrency(
            eligibleGames,
            6,
            async (game) => {
              const existing = existingByExternalReference.get(game.id);

              if (existing && existing.checksum === (game.checksum ?? null)) {
                return {
                  id: game.id,
                  name: game.name,
                  gameId: existing.$id,
                  skippedByChecksum: true,
                };
              }

              const developers = await this.getDevs(game);
              const parsedGame = this.parseGame(game, developers);
              const gameId = await this.upsertService.upsertGameRow(parsedGame);
              await this.upsertService.ensureGameZStats(gameId);

              return {
                id: game.id,
                name: game.name,
                gameId,
                skippedByChecksum: false,
              };
            },
          );

          const skippedByChecksum = processedGames.filter(
            (item) => item.skippedByChecksum,
          ).length;

          const results = processedGames.map(({ id, name, gameId }) => ({
            id,
            name,
            gameId,
          }));

          return {
            message: 'Jogos populares sincronizados com sucesso',
            success: true,
            count: results.length,
            skippedByChecksum,
            items: results,
          };
        },
      );

    return this.correlationContext.getCorrelationId()
      ? run()
      : this.correlationContext.runWithGeneratedCorrelationId(
          () => run(),
          'cron',
        );
  }

  private async getExistingGamesByExternalReference(
    externalReferences: number[],
  ) {
    const uniqueReferences = Array.from(new Set(externalReferences));

    if (uniqueReferences.length === 0) {
      return new Map<number, { $id: string; checksum: string | null }>();
    }

    const existingGames = await this.tableDB.listRows<
      Models.Row & {
        externalReference: number;
        checksum?: string | null;
      }
    >({
      databaseId: IGDBService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('externalReference', uniqueReferences as any),
        Query.select(['$id', 'externalReference', 'checksum']),
        Query.limit(uniqueReferences.length),
      ],
    });

    const result = new Map<number, { $id: string; checksum: string | null }>();

    for (const game of existingGames.rows) {
      result.set(game.externalReference, {
        $id: game.$id,
        checksum: game.checksum ?? null,
      });
    }

    return result;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    handler: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let currentIndex = 0;

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (true) {
          const index = currentIndex;
          currentIndex += 1;

          if (index >= items.length) {
            break;
          }

          results[index] = await handler(items[index]);
        }
      },
    );

    await Promise.all(workers);
    return results;
  }

  async searchGames(queryText: string, limit = 20, offset = 0) {
    const safeText = queryText.replace(/"/g, '\\"');

    const query = `
      search "${safeText}";
      fields ${this.gameFields};
      where version_parent = null & game_type != (3,5,7,12,13,14);
      limit ${limit};
      offset ${offset};
    `;
    return await this.fetchIgdb('games', query);
  }

  async getGamesByIds(ids: number[] = [], limit = 12) {
    if (!ids.length) return [];
    const query = `
      fields ${this.gameFields};
      where id = (${ids.join(',')});
      limit ${limit};
    `;
    return await this.fetchIgdb('games', query);
  }

  async getGenresFromGames(ids: number[] = [], limit = 12) {
    if (!ids.length) return [];
    const query = `
      fields genres;
      where id = (${ids.join(',')});
      limit ${limit};
    `;
    return await this.fetchIgdb('games', query);
  }

  async getGameDevelopers(ids: number[] = []) {
    if (!ids.length) return [];
    const query = `
        fields game, company.name, company.slug, company.checksum;
        where game = (${ids.join(',')}) & developer = true;
     `;
    return await this.fetchIgdb('involved_companies', query);
  }

  async getGameTypes(limit = 50, offset = 0) {
    const query = `fields id,type,checksum; limit ${limit}; offset ${offset};`;
    return await this.fetchIgdb('game_types', query);
  }

  async getGenres(limit = 500, offset = 0): Promise<IGDBGenre[]> {
    const query = `
      fields id,name,slug,checksum;
      sort id asc;
      limit ${limit};
      offset ${offset};
    `;

    return await this.fetchIgdb('genres', query);
  }

  async fetchGameMedias(igdbGameId: number): Promise<IGDBGameMedia | null> {
    const query = `
      fields artworks.image_id, artworks.artwork_type, screenshots.image_id, videos.name, videos.video_id;
      where id = (${igdbGameId});
    `;
    const results = await this.fetchIgdb('games', query);
    return (results[0] as IGDBGameMedia) ?? null;
  }

  async importGameById(id: number, options: { force?: boolean } = {}) {
    const [igdbGame] = await this.getGamesByIds([id], 1);

    if (!igdbGame) {
      throw new NotFoundException('Jogo não encontrado no IGDB');
    }

    const preferredGameId = `igdb_${igdbGame.id}`;
    const existingGame = await this.findExistingGameForUpdate(
      igdbGame.id,
      preferredGameId,
    );

    if (this.shouldIgnore(igdbGame) && !existingGame.exists && !options.force) {
      throw new ConflictException('Jogo não elegível para ingestão');
    }

    if (
      existingGame.exists &&
      existingGame.checksum === (igdbGame.checksum ?? null)
    ) {
      await this.upsertService.ensureGameZStats(existingGame.$id);

      return {
        message: `Jogo ${igdbGame.name} já está atualizado`,
        success: true,
        gameId: existingGame.$id,
      };
    }

    const developers = await this.getDevs(igdbGame);
    const parsedGame = this.parseGame(igdbGame, developers);
    const gameId = await this.upsertService.upsertGameRow(parsedGame);

    await this.upsertService.ensureGameZStats(gameId);

    return {
      message: `Jogo ${igdbGame.name} adicionado ou atualizado com sucesso`,
      success: true,
      gameId,
    };
  }

  private async findExistingGameForUpdate(
    externalReference: number,
    fallbackGameId: string,
  ): Promise<{
    exists: boolean;
    $id: string;
    checksum: string | null;
    involvedCompaniesIds: string[];
  }> {
    const response = await this.tableDB.listRows<
      Models.Row & {
        checksum?: string | null;
        involvedCompanies?: Array<{ $id?: string }>;
      }
    >({
      databaseId: IGDBService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('externalReference', externalReference),
        Query.select(['$id', 'checksum', 'involvedCompanies.$id'] as any),
        Query.limit(1),
      ],
    });

    const game = response.rows[0];

    if (!game) {
      return {
        exists: false,
        $id: fallbackGameId,
        checksum: null,
        involvedCompaniesIds: [],
      };
    }

    const involvedCompaniesIds = (game.involvedCompanies ?? [])
      .map((company) => company?.$id)
      .filter((id): id is string => !!id);

    return {
      exists: true,
      $id: game.$id,
      checksum: game.checksum ?? null,
      involvedCompaniesIds,
    };
  }

  private parseGame(game: IGDBGame, developers: string[] = []) {
    const { releaseDate, releaseYear } = this.resolveReleaseData(game);

    let summary = game.summary ?? '';
    const summaryLength = summary.length;

    if (summaryLength > 750) {
      summary = `${summary.substring(0, 747)}...`;
    }

    const uniqueDevelopers = Array.from(new Set(developers));

    return {
      name: game.name,
      slug: game.slug ?? '',
      coverUrl: game.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      summary,
      releaseYear,
      releaseDate,
      genres: game.genres
        ? game.genres.map((genreId: number) => `igdb_${genreId}`)
        : [],
      involvedCompanies: uniqueDevelopers,
      externalReference: game.id,
      gameType: game.game_type ? `igdb_${game.game_type}` : null,
      similarGames: game.similar_games
        ? game.similar_games.map((relatedId: number) => `igdb_${relatedId}`)
        : [],
      checksum: game.checksum || null,
      hypes: game.hypes ?? 0,
      syncStage: 'full',
    } as GamesCreate;
  }

  private resolveReleaseData(game: IGDBGame): {
    releaseDate: string | null;
    releaseYear: string | null;
  } {
    const timestamp = game.first_release_date;

    if (
      typeof timestamp !== 'number' ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0
    ) {
      return { releaseDate: null, releaseYear: null };
    }

    const release = new Date(timestamp * 1000);

    if (Number.isNaN(release.getTime())) {
      return { releaseDate: null, releaseYear: null };
    }

    return {
      releaseDate: release.toISOString(),
      releaseYear: release.getUTCFullYear().toString(),
    };
  }

  private async getDevs(game: IGDBGame) {
    const developers = (game.involved_companies ?? []).filter(
      (ic) => ic.developer && ic.company?.id,
    );

    const developerIds = Array.from(
      new Set(developers.map((dev) => `igdb_${dev.company.id}`)),
    );

    if (developerIds.length === 0) return developerIds;

    const { rows: existing } = await this.tableDB.listRows<Models.Row>({
      databaseId: IGDBService.DB_ID,
      tableId: 'companies',
      queries: [Query.equal('$id', developerIds as any), Query.select(['$id'])],
    });

    const existingIds = new Set(existing.map((row) => row.$id));

    const missing = developers.filter(
      (dev) => !existingIds.has(`igdb_${dev.company.id}`),
    );

    if (missing.length > 0) {
      await this.tableDB.upsertRows({
        databaseId: 'app',
        tableId: 'companies',
        rows: missing.map((dev) => ({
          $id: `igdb_${dev.company.id}`,
          name: dev.company.name,
          slug: dev.company.slug,
          checksum: dev.company.checksum,
        })),
      });
    }

    return developerIds;
  }

  private shouldIgnore(game: IGDBGame) {
    return (
      [3, 5, 7, 12, 13, 14].includes(game.game_type ?? 0) ||
      (game.version_parent !== undefined && game.version_parent !== null)
    );
  }
}
