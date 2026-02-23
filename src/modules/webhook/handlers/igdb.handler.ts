import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBService } from '../../igdb/igdb.service';
import { IGDBGame } from '../../igdb/igdb.types';
import { Companies } from 'infra/appwrite';

@Injectable()
export class IGDBHandler {
  private readonly logger = new Logger(IGDBHandler.name);

  private tableDB: Appwrite['databases']['api'];
  private companies: Appwrite['databases']['companies'];
  private zStats: Appwrite['databases']['zStats'];

  constructor(
    private appwrite: Appwrite,
    private igdb: IGDBService,
  ) {
    this.tableDB = this.appwrite.databases.api;
    this.companies = this.appwrite.databases.companies;
    this.zStats = this.appwrite.databases.zStats;
  }

  async upsertGame(game: IGDBGame) {
    if (this.shouldIgnore(game)) {
      this.logger.log(`O jogo de id: ${game.id} foi ignorado`);
      throw new HttpException('Jogo ignorado', HttpStatus.OK);
    }

    const igdbGames = await this.igdb.getGamesByIds([game.id]);

    if (!igdbGames || igdbGames.length === 0) {
      throw new HttpException('Jogo não localizado', HttpStatus.OK);
    }

    try {
      const igdbGame = igdbGames[0];
      const devs = this.getDevs(igdbGame);

      const parsedGame = this.parseGame(igdbGame);

      const gameId = `igdb_${parsedGame.externalReference}`;
      const zstatsId = `zstats_${gameId}`;

      await this.tableDB.upsertRow({
        databaseId: 'app',
        tableId: 'games',
        rowId: gameId,
        data: parsedGame,
      });

      try {
        await this.zStats.create({ game: gameId }, { rowId: zstatsId });
      } catch {}

      this.logger.log(`O jogo ${igdbGame.name} foi processado com sucesso`);
      return {
        message: `O jogo ${igdbGame.name} foi processado com sucesso`,
        success: true,
      };
    } catch (e) {
      throw new HttpException('Erro ao processar o jogo', HttpStatus.OK);
    }
  }

  /** Métodos auxiliares */
  private parseGame(game: IGDBGame, developers: string[] = []) {
    const syncedAt = new Date().toISOString();

    let summary = game.summary;
    const summaryLength = summary ? summary.length : 0;

    if (summaryLength > 750) {
      const truncatedSummary = summary.substring(0, 747) + '...';
      summary = truncatedSummary;
    }

    return {
      name: game.name,
      slug: game.slug,
      coverUrl: game.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      summary: summary || '',
      releaseYear: game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear().toString()
        : null,
      releaseDate: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString()
        : null,
      genres: game.genres
        ? game.genres.map((genreId) => `igdb_${genreId}`)
        : [],
      involvedCompanies: developers,
      externalReference: game.id,
      gameType: `igdb_${game.game_type}`,
      similarGames: game.similar_games
        ? game.similar_games.map((g) => `igdb_${g}`)
        : [],
      checksum: game.checksum || null,
      syncedAt,
    };
  }

  private async getDevs(game: IGDBGame) {
    const involvedCompanies = game.involved_companies ?? [];
    const developers = involvedCompanies.filter((ic) => ic.developer);

    const developersIds = developers
      .filter((dev) => dev.company?.id)
      .map((dev) => `igdb_${dev.company.id}`);

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

      return developersIds;
    }
  }

  private shouldIgnore(game: IGDBGame) {
    return (
      [3, 5, 7, 12, 13, 14].includes(game.game_type) ||
      (game.version_parent && game.version_parent !== null)
    );
  }
}
6;
