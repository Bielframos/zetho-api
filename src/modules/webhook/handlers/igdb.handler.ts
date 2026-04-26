import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { GamesCreate } from 'infra/appwrite';
import { AppwriteException } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBGame, IGDBGenre } from '../../igdb/igdb.types';

@Injectable()
export class IGDBHandler {
  private readonly logger = new Logger(IGDBHandler.name);

  private tableDB: Appwrite['databases']['api'];
  private games: Appwrite['databases']['games'];
  private zStats: Appwrite['databases']['zStats'];

  constructor(private appwrite: Appwrite) {
    this.tableDB = this.appwrite.databases.api;
    this.games = this.appwrite.databases.games;
    this.zStats = this.appwrite.databases.zStats;
  }

  /** Método principal para processar o jogo recebido do webhook */
  async upsertGame(game: IGDBGame) {
    const startedAt = process.hrtime.bigint();
    let stage = 'received';
    let appwriteGameId = `igdb_${game.id}`;

    if (this.shouldIgnore(game)) {
      this.logger.log(`O jogo de id: ${game.id} foi ignorado`);
      throw new HttpException('Jogo ignorado', HttpStatus.OK);
    }

    try {
      const parsedGame = this.parseBasicGame(game);
      stage = 'persist_game';
      appwriteGameId = await this.upsertGameRow(parsedGame);

      stage = 'persist_zstats';
      await this.ensureGameZStats(appwriteGameId);

      this.logger.log(`O jogo ${game.name} foi registrado com sucesso`);

      return {
        message: `O jogo ${game.name} foi registrado com sucesso`,
        success: true,
      };
    } catch (e) {
      this.logger.error({
        message: `Erro ao processar o jogo ${game.name ?? game.id}`,
        stage,
        receivedGameId: game.id,
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
  private parseBasicGame(game: IGDBGame): GamesCreate {
    return {
      name: game.name,
      slug: game.slug ?? '',
      coverUrl: game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      externalReference: game.id,
      checksum: game.checksum || null,
      syncStage: 'basic',
    };
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

    // Jogo já existe: compara checksum antes de atualizar
    const existing = await this.findExistingGame(
      game.externalReference,
      preferredGameId,
    );

    if (existing.checksum && existing.checksum === game.checksum) {
      return existing.$id;
    }

    await this.games.update(existing.$id, game);
    return existing.$id;
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

  private async findExistingGame(
    externalReference: number,
    fallbackId: string,
  ): Promise<{ $id: string; checksum?: string | null }> {
    const response = await this.games.list({
      queries: (q) => [
        q.equal('externalReference', externalReference),
        q.select(['$id', 'checksum']),
        q.limit(1),
      ],
    });

    if (response.rows[0]) {
      return {
        $id: response.rows[0].$id,
        checksum: response.rows[0].checksum,
      };
    }

    return { $id: fallbackId, checksum: null };
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

  private shouldIgnore(game: IGDBGame) {
    return (
      [3, 5, 7, 12, 13, 14].includes(game.game_type ?? 0) ||
      (game.version_parent !== undefined && game.version_parent !== null)
    );
  }
}
