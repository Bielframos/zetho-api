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
import { Companies, GamesCreate } from 'infra/appwrite';

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

  /**
   * Aplica rate limiting: máximo 4 requisições por segundo
   * Espera se necessário com base na requisição mais antiga
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();

    // Remove requisições fora da janela de tempo (mais antigas que 1 segundo)
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.WINDOW_SIZE_MS,
    );

    // Se ainda não atingimos o limite, pode fazer a requisição
    if (this.requestTimestamps.length < this.MAX_REQUESTS_PER_SECOND) {
      this.requestTimestamps.push(now);
      return;
    }

    // Atingimos o limite, calcular tempo de espera
    const oldestTimestamp = this.requestTimestamps[0];
    const timePassed = now - oldestTimestamp;
    const timeToWait = this.WINDOW_SIZE_MS - timePassed + this.SAFETY_BUFFER_MS;

    this.logger.debug(
      `Rate limit atingido. Aguardando ${timeToWait}ms antes da próxima requisição.`,
    );

    await new Promise((resolve) => setTimeout(resolve, timeToWait));

    // Recursivamente aplica rate limit novamente para garantir consistência
    await this.applyRateLimit();
  }

  /**
   * Garante um token válido (Cache -> Appwrite -> Twitch)
   */
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

  /**
   * Lógica central de recuperação do token
   */
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

  /**
   * Autentica na Twitch e salva no Appwrite
   */
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

  /**
   * Wrapper para o fetch
   */
  private async fetchIgdb(endpoint: string, body: string) {
    // Aplica rate limiting antes de fazer a requisição
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

  // --- MÉTODOS PÚBLICOS ---

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

    const popularGames = await this.fetchIgdb('games', query);

    const results = [] as Array<{ id: number; name: string; gameId: string }>;

    for (const game of popularGames) {
      if (this.shouldIgnore(game)) {
        continue;
      }

      const developers = await this.getDevs(game);
      const parsedGame = this.parseGame(game, developers);
      const appwriteGameId = await this.upsertGameRow(parsedGame);
      await this.ensureGameZStats(appwriteGameId);

      results.push({ id: game.id, name: game.name, gameId: appwriteGameId });
    }

    return {
      message: 'Jogos populares sincronizados com sucesso',
      success: true,
      count: results.length,
      items: results,
    };
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
    const existingGame = await this.games.list({
      queries: (q) => [
        q.equal('externalReference', id),
        q.select(['$id', 'name', 'externalReference']),
        q.limit(1),
      ],
    });

    if (existingGame.total > 0) {
      throw new ConflictException('Jogo já existe na base de dados');
    }

    const [igdbGame] = await this.getGamesByIds([id], 1);

    if (!igdbGame) {
      throw new NotFoundException('Jogo não encontrado no IGDB');
    }

    if (this.shouldIgnore(igdbGame)) {
      throw new ConflictException('Jogo não elegível para ingestão');
    }

    const developers = await this.getDevs(igdbGame);
    const parsedGame = this.parseGame(igdbGame, developers);
    const rowId = `igdb_${id}`;

    try {
      await this.games.create(parsedGame, { rowId });
    } catch (error) {
      const appwriteError = error as AppwriteException;

      if (appwriteError.code === 409) {
        throw new ConflictException('Jogo já existe na base de dados');
      }

      throw error;
    }

    await this.ensureGameZStats(rowId);

    return {
      message: `Jogo ${igdbGame.name} adicionado com sucesso`,
      success: true,
      gameId: rowId,
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

    const existingGameId = await this.findExistingGameId(
      parsedGame.externalReference,
      preferredGameId,
    );

    await this.games.update(existingGameId, parsedGame);
    return existingGameId;
  }

  private async findExistingGameId(
    externalReference: number,
    fallbackGameId: string,
  ) {
    const response = await this.games.list({
      queries: (q) => [
        q.equal('externalReference', externalReference),
        q.select(['$id']),
        q.limit(1),
      ],
    });

    return response.rows[0]?.$id ?? fallbackGameId;
  }

  private parseGame(game: IGDBGame, developers: string[] = []) {
    const syncedAt = new Date().toISOString();
    const { releaseDate, releaseYear } = this.resolveReleaseData(game);

    let summary = game.summary ?? '';
    const summaryLength = summary.length;

    if (summaryLength > 750) {
      summary = `${summary.substring(0, 747)}...`;
    }

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
      involvedCompanies: developers,
      externalReference: game.id,
      gameType: game.game_type ? `igdb_${game.game_type}` : null,
      similarGames: game.similar_games
        ? game.similar_games.map((relatedId: number) => `igdb_${relatedId}`)
        : [],
      checksum: game.checksum || null,
      syncedAt,
      hypes: game.hypes ?? 0,
      syncStatus: this.resolveSyncStatus(game),
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

  private resolveSyncStatus(game: IGDBGame): string | null {
    const status = game.game_status ?? game.status;

    if (status === null || status === undefined) {
      return null;
    }

    if (typeof status === 'string') {
      return status;
    }

    if (typeof status === 'number') {
      return String(status);
    }

    if (typeof status === 'object') {
      if ('name' in status && typeof status.name === 'string') {
        return status.name;
      }

      if (
        'id' in status &&
        (typeof status.id === 'number' || typeof status.id === 'string')
      ) {
        return String(status.id);
      }
    }

    return null;
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
    const involvedCompanies = game.involved_companies ?? [];
    const developers = involvedCompanies.filter((ic) => ic.developer);

    const developerIds = developers
      .filter((dev) => dev.company?.id)
      .map((dev) => `igdb_${dev.company.id}`);

    let registeredCompanies: Companies[] = [];

    if (developerIds.length > 0) {
      const response = await this.companies.list({
        queries: (q) => [
          q.equal('$id', developerIds as any),
          q.select(['$id']),
        ],
      });

      registeredCompanies = response.rows;
    }

    const existingIds = new Set(registeredCompanies.map((row) => row.$id));

    const missingDeveloperCompanies = developers.filter((dev) => {
      const formattedId = dev.company?.id ? `igdb_${dev.company.id}` : null;
      return formattedId && !existingIds.has(formattedId);
    });

    if (missingDeveloperCompanies.length > 0) {
      const validDevelopers = missingDeveloperCompanies.filter(
        (dev) => dev.company?.id,
      );

      if (validDevelopers.length > 0) {
        await this.tableDB.upsertRows({
          databaseId: 'app',
          tableId: 'companies',
          rows: validDevelopers.map((dev) => ({
            $id: `igdb_${dev.company.id}`,
            name: dev.company.name,
            slug: dev.company.slug,
            checksum: dev.company.checksum,
          })),
        });
      }
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
