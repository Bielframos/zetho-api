import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBGame, IGDBGameMedia, IGDBGenre } from './igdb.types';
import { AppwriteException } from 'node-appwrite';
import { GamesCreate } from 'infra/appwrite';

@Injectable()
export class IGDBService {
  private readonly logger = new Logger(IGDBService.name);
  private tokens: Appwrite['databases']['igdbTokens'];
  private tableDB: Appwrite['databases']['api'];
  private games: Appwrite['databases']['games'];
  private companies: Appwrite['databases']['companies'];
  private zStats: Appwrite['databases']['zStats'];

  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  private authPromise: Promise<string> | null = null;

  // Rate limiting: máximo 4 requisições por segundo
  private readonly MAX_REQUESTS_PER_SECOND = 4;
  private readonly WINDOW_SIZE_MS = 1000;
  private readonly SAFETY_BUFFER_MS = 10;

  private requestTimestamps: number[] = [];

  constructor(private appwrite: Appwrite) {
    this.tokens = this.appwrite.databases.igdbTokens;
    this.tableDB = this.appwrite.databases.api;
    this.companies = this.appwrite.databases.companies;
    this.games = this.appwrite.databases.games;
    this.zStats = this.appwrite.databases.zStats;
  }

  private async applyRateLimit(): Promise<void> {
    while (true) {
      const now = Date.now();

      this.requestTimestamps = this.requestTimestamps.filter(
        (ts) => now - ts < this.WINDOW_SIZE_MS,
      );

      if (this.requestTimestamps.length < this.MAX_REQUESTS_PER_SECOND) {
        this.requestTimestamps.push(now);
        return;
      }

      const timeToWait =
        this.WINDOW_SIZE_MS -
        (now - this.requestTimestamps[0]) +
        this.SAFETY_BUFFER_MS;

      this.logger.debug(`Rate limit atingido. Aguardando ${timeToWait}ms.`);
      await new Promise((resolve) => setTimeout(resolve, timeToWait));
    }
  }

  private async getToken(): Promise<string> {
    if (this.authPromise) {
      return this.authPromise;
    }

    const nowWithBuffer = new Date(Date.now() + 5 * 60 * 1000);

    if (this.token && this.tokenExpiry && this.tokenExpiry > nowWithBuffer) {
      return this.token;
    }

    this.authPromise = this.resolveToken();

    try {
      const token = await this.authPromise;
      return token;
    } finally {
      this.authPromise = null;
    }
  }

  private async resolveToken(): Promise<string> {
    try {
      const existing = await this.tokens.list({
        queries: (q) => [q.orderDesc('$createdAt'), q.limit(1)],
      });

      if (existing.rows.length > 0) {
        const storedToken = existing.rows[0];
        const expiry = new Date(storedToken.expiresAt);

        if (expiry > new Date(Date.now() + 5 * 60 * 1000)) {
          this.token = storedToken.secret;
          this.tokenExpiry = expiry;
          this.logger.log('Token IGDB recuperado do Appwrite.');
          return this.token;
        }
      }
    } catch (error) {
      this.logger.warn(
        'Falha ao ler token do Appwrite, tentando gerar novo.',
        error,
      );
    }

    return await this.authenticate();
  }

  private async authenticate(): Promise<string> {
    this.logger.log('Gerando novo token IGDB via Twitch...');

    const url = new URL('https://id.twitch.tv/oauth2/token');

    url.search = new URLSearchParams({
      client_id: process.env.IGDB_CLIENT_ID as string,
      client_secret: process.env.IGDB_CLIENT_SECRET as string,
      grant_type: 'client_credentials',
    }).toString();

    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
      throw new InternalServerErrorException(
        'Falha ao autenticar na Twitch/IGDB',
      );
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    this.token = data.access_token;
    this.tokenExpiry = expiresAt;

    try {
      await this.tokens.create({
        secret: data.access_token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (e) {
      this.logger.error('Erro ao salvar token no Appwrite', e);
    }

    return this.token as string;
  }

  private async fetchIgdb(endpoint: string, body: string) {
    await this.applyRateLimit();

    const token = await this.getToken();

    const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': process.env.IGDB_CLIENT_ID as string,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerErrorException(`IGDB Error: ${text}`);
    }

    return await response.json();
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
    const query = `
      fields ${this.gameFields};
      where first_release_date > 1777030000 & hypes != null & version_parent = null & game_type != (3,5,7,12,13,14);
      sort hypes desc;
      limit 50;
    `;

    const popularGames = (await this.fetchIgdb('games', query)) as IGDBGame[];
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
        const gameId = await this.upsertGameRow(parsedGame);
        await this.ensureGameZStats(gameId);

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
  }

  private async getExistingGamesByExternalReference(
    externalReferences: number[],
  ) {
    const uniqueReferences = Array.from(new Set(externalReferences));

    if (uniqueReferences.length === 0) {
      return new Map<number, { $id: string; checksum: string | null }>();
    }

    const existingGames = await this.games.list({
      queries: (q) => [
        q.equal('externalReference', uniqueReferences as any),
        q.select(['$id', 'externalReference', 'checksum']),
        q.limit(uniqueReferences.length),
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

  async importGameById(id: number) {
    const [igdbGame] = await this.getGamesByIds([id], 1);

    if (!igdbGame) {
      throw new NotFoundException('Jogo não encontrado no IGDB');
    }

    if (this.shouldIgnore(igdbGame)) {
      throw new ConflictException('Jogo não elegível para ingestão');
    }

    const preferredGameId = `igdb_${igdbGame.id}`;
    const existingGame = await this.findExistingGameForUpdate(
      igdbGame.id,
      preferredGameId,
    );

    if (
      existingGame.exists &&
      existingGame.checksum === (igdbGame.checksum ?? null)
    ) {
      await this.ensureGameZStats(existingGame.$id);

      return {
        message: `Jogo ${igdbGame.name} já está atualizado`,
        success: true,
        gameId: existingGame.$id,
      };
    }

    const developers = await this.getDevs(igdbGame);
    const parsedGame = this.parseGame(igdbGame, developers);
    const gameId = await this.upsertGameRow(parsedGame);

    await this.ensureGameZStats(gameId);

    return {
      message: `Jogo ${igdbGame.name} adicionado ou atualizado com sucesso`,
      success: true,
      gameId,
    };
  }

  private async upsertGameRow(parsedGame: GamesCreate) {
    const preferredGameId = `igdb_${parsedGame.externalReference}`;

    try {
      await this.games.create(parsedGame, { rowId: preferredGameId });
      return preferredGameId;
    } catch (error) {
      const appwriteError = error as AppwriteException;

      if (appwriteError.code !== 409) {
        throw error;
      }
    }

    const existingGame = await this.findExistingGameForUpdate(
      parsedGame.externalReference,
      preferredGameId,
    );

    if (existingGame.checksum === (parsedGame.checksum ?? null)) {
      return existingGame.$id;
    }

    const { updatePayload, companiesChanged, nextCompanies } =
      this.buildSafeGameUpdatePayload(parsedGame, existingGame);

    await this.games.update(existingGame.$id, updatePayload);

    if (companiesChanged) {
      // Appwrite faz append em campos de relacionamento via updateRow.
      // Para garantir replace, primeiro limpamos e depois setamos as companies.
      await this.games.update(existingGame.$id, {
        involvedCompanies: [],
      } as unknown as GamesCreate);
      await this.games.update(existingGame.$id, {
        involvedCompanies: nextCompanies,
      } as GamesCreate);
    }

    return existingGame.$id;
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
    const response = await this.games.list({
      queries: (q) => [
        q.equal('externalReference', externalReference),
        q.select(['$id', 'checksum', 'involvedCompanies.$id'] as any),
        q.limit(1),
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

  private buildSafeGameUpdatePayload(
    parsedGame: GamesCreate,
    existingGame: { involvedCompaniesIds: string[] },
  ): {
    updatePayload: GamesCreate;
    companiesChanged: boolean;
    nextCompanies: string[];
  } {
    const nextCompanies = (parsedGame.involvedCompanies ?? []).filter(
      (company): company is string => typeof company === 'string',
    );

    const currentSet = new Set(existingGame.involvedCompaniesIds);
    const companiesChanged =
      currentSet.size !== nextCompanies.length ||
      !nextCompanies.every((id) => currentSet.has(id));

    const { involvedCompanies: _, ...updatePayload } = parsedGame;

    return { updatePayload, companiesChanged, nextCompanies };
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

  private async ensureGameZStats(gameId: string) {
    const zstatsId = `zstats_${gameId}`;

    try {
      await this.zStats.create({ game: gameId }, { rowId: zstatsId });
    } catch (error) {
      const appwriteError = error as AppwriteException;

      if (appwriteError.code !== 409) {
        throw error;
      }
    }
  }

  private async getDevs(game: IGDBGame) {
    const developers = (game.involved_companies ?? []).filter(
      (ic) => ic.developer && ic.company?.id,
    );

    const developerIds = Array.from(
      new Set(developers.map((dev) => `igdb_${dev.company.id}`)),
    );

    if (developerIds.length === 0) return developerIds;

    const { rows: existing } = await this.companies.list({
      queries: (q) => [q.equal('$id', developerIds as any), q.select(['$id'])],
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
