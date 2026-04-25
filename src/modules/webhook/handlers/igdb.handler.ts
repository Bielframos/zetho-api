import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Companies, GamesCreate } from 'infra/appwrite';
import { AppwriteException } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBService } from '../../igdb/igdb.service';
import { IGDBGame, IGDBGenre } from '../../igdb/igdb.types';

@Injectable()
export class IGDBHandler {
  private readonly logger = new Logger(IGDBHandler.name);

  private tableDB: Appwrite['databases']['api'];
  private games: Appwrite['databases']['games'];
  private companies: Appwrite['databases']['companies'];
  private zStats: Appwrite['databases']['zStats'];

  constructor(
    private appwrite: Appwrite,
    private igdb: IGDBService,
  ) {
    this.tableDB = this.appwrite.databases.api;
    this.companies = this.appwrite.databases.companies;
    this.games = this.appwrite.databases.games;
    this.zStats = this.appwrite.databases.zStats;
  }

  /** Método principal para processar o jogo recebido do webhook */
  async upsertGame(game: IGDBGame) {
    const startedAt = process.hrtime.bigint();
    let stage = 'received';
    let igdbGameName = game.name;
    let appwriteGameId = `igdb_${game.id}`;

    if (this.shouldIgnore(game)) {
      this.logger.log(`O jogo de id: ${game.id} foi ignorado`);
      throw new HttpException('Jogo ignorado', HttpStatus.OK);
    }

    stage = 'fetch_igdb_game';
    const igdbGames = await this.igdb.getGamesByIds([game.id]);

    if (!igdbGames || igdbGames.length === 0) {
      this.logger.warn(`Jogo IGDB ${game.id} não localizado após o webhook`);
      throw new HttpException('Jogo não localizado', HttpStatus.OK);
    }

    try {
      const igdbGame = igdbGames[0];
      igdbGameName = igdbGame.name;

      stage = 'fetch_developers';
      const devs = await this.getDevs(igdbGame);

      const parsedGame = this.parseGame(igdbGame, devs);
      stage = 'persist_game';
      appwriteGameId = await this.upsertGameRow(parsedGame);

      stage = 'persist_zstats';
      await this.ensureGameZStats(appwriteGameId);

      this.logger.log(`O jogo ${igdbGame.name} foi processado com sucesso`);

      return {
        message: `O jogo ${igdbGame.name} foi processado com sucesso`,
        success: true,
      };
    } catch (e) {
      this.logger.error({
        message: `Erro ao processar o jogo ${igdbGameName ?? game.id}`,
        stage,
        receivedGameId: game.id,
        igdbGameName,
        appwriteGameId,
        durationMs: this.getDurationMs(startedAt),
        error: this.serializeError(e),
      });
      throw new HttpException('Erro ao processar o jogo', HttpStatus.OK);
    }
  }

  /** Métodos para processar gêneros */
  async upsertGenre(genre: IGDBGenre) {
    try {
      await this.tableDB.upsertRow({
        databaseId: 'app',
        tableId: 'genres',
        rowId: `igdb_${genre.id}`,
        data: {
          name: genre.name,
          slug: genre.slug,
          checksum: genre.checksum,
        },
      });

      return {
        message: `Gênero ${genre.name} processado com sucesso`,
        success: true,
      };
    } catch (e) {
      throw new HttpException('Erro ao processar o gênero', HttpStatus.OK);
    }
  }

  /* Método para processar exclusão de gêneros */
  async deleteGenre(genre: IGDBGenre) {
    try {
      await this.tableDB.deleteRow({
        databaseId: 'app',
        tableId: 'genres',
        rowId: `igdb_${genre.id}`,
      });

      return {
        message: `Gênero ${genre.name} deletado com sucesso`,
        success: true,
      };
    } catch (e) {
      throw new HttpException('Erro ao deletar o gênero', HttpStatus.OK);
    }
  }

  /** Métodos auxiliares */
  private parseGame(game: IGDBGame, developers: string[] = []) {
    const syncedAt = new Date().toISOString();

    let summary = game.summary ?? '';
    const summaryLength = summary.length;

    if (summaryLength > 750) {
      const truncatedSummary = summary.substring(0, 747) + '...';
      summary = truncatedSummary;
    }

    const uniqueDevelopers = Array.from(new Set(developers));

    return {
      name: game.name,
      slug: game.slug ?? '',
      coverUrl: game.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      summary,
      releaseYear: game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear().toString()
        : null,
      releaseDate: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString()
        : null,
      genres: game.genres
        ? game.genres.map((genreId) => `igdb_${genreId}`)
        : [],
      involvedCompanies: uniqueDevelopers,
      externalReference: game.id,
      gameType: game.game_type ? `igdb_${game.game_type}` : undefined,
      similarGames: game.similar_games
        ? game.similar_games.map((g) => `igdb_${g}`)
        : [],
      checksum: game.checksum || null,
      syncedAt,
      hypes: game.hypes ?? 0,
      syncStatus: game.status ?? null,
    } as GamesCreate;
  }

  private async upsertGameRow(game: GamesCreate) {
    const preferredGameId = `igdb_${game.externalReference}`;

    try {
      await this.games.create(game, { rowId: preferredGameId });
      return preferredGameId;
    } catch (error) {
      const appwriteError = error as AppwriteException;

      if (appwriteError.code !== 409) {
        throw error;
      }
    }

    const existingGameId = await this.findExistingGameId(
      game.externalReference,
      preferredGameId,
    );

    await this.games.update(existingGameId, game);
    return existingGameId;
  }

  private async ensureGameZStats(gameId: string) {
    const zstatsId = `zstats_${gameId}`;

    try {
      await this.zStats.create({ game: gameId }, { rowId: zstatsId });
      return;
    } catch (error) {
      const appwriteError = error as AppwriteException;

      if (appwriteError.code !== 409) {
        throw error;
      }
    }
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

  private getDurationMs(startedAt: bigint) {
    return Number((process.hrtime.bigint() - startedAt) / BigInt(1e6));
  }

  private serializeError(error: unknown) {
    if (error instanceof AppwriteException) {
      return {
        name: error.name,
        message: error.message,
        code: error.code,
        type: error.type,
        response: error.response,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return error;
  }

  private async getDevs(game: IGDBGame) {
    const involvedCompanies = game.involved_companies ?? [];
    const developers = involvedCompanies.filter((ic) => ic.developer);

    const developersIds = Array.from(
      new Set(
        developers
          .filter((dev) => dev.company?.id)
          .map((dev) => `igdb_${dev.company.id}`),
      ),
    );

    let registeredCompanies: Companies[] = [];

    if (developersIds.length > 0) {
      const response = await this.companies.list({
        queries: (q) => [
          q.equal('$id', developersIds as any),
          q.select(['$id']),
        ],
      });

      registeredCompanies = response.rows;
    }

    const existingIds = new Set(registeredCompanies.map((row) => row.$id));

    const missingDevCompanies = developers.filter((dev) => {
      const formattedId = dev.company?.id ? `igdb_${dev.company.id}` : null;
      return formattedId && !existingIds.has(formattedId);
    });

    if (missingDevCompanies.length > 0) {
      const validDevelopers = missingDevCompanies.filter(
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

    return developersIds;
  }

  private shouldIgnore(game: IGDBGame) {
    return (
      [3, 5, 7, 12, 13, 14].includes(game.game_type ?? 0) ||
      (game.version_parent !== undefined && game.version_parent !== null)
    );
  }
}
