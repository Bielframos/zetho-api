import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class IGDBService {
  private readonly logger = new Logger(IGDBService.name);
  private tokens: Appwrite['databases']['igdbTokens'];

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
    'name,slug,game_status,game_type,summary,cover.image_id,first_release_date,similar_games,checksum,genres,involved_companies.company,involved_companies.developer,involved_companies.company.name,involved_companies.company.slug,involved_companies.company.checksum';

  async getGames(limit = 50, offset = 0) {
    const query = `
      fields ${this.gameFields};
      where rating >= 48 & version_parent = null & game_type != (3,5,7,12,13,14);
      limit ${limit};
      offset ${offset};
    `;
    return await this.fetchIgdb('games', query);
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
}
