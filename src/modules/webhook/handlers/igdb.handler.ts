import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { GamesCreate } from 'src/infra/appwrite/appwrite';
import { GamesSyncStage } from 'src/infra/appwrite/appwrite.enums';
import { AppwriteException, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { IGDBGame, IGDBGenre } from '../../igdb/igdb.types';
import { IGDBUpsertService } from '../../igdb/igdb-upsert.service';

@Injectable()
export class IGDBHandler {
  private readonly logger = new Logger(IGDBHandler.name);
  private static readonly DB_ID = 'app';

  private tableDB: Appwrite['tablesDB'];

  constructor(
    private appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly upsertService: IGDBUpsertService,
  ) {
    this.tableDB = this.appwrite.tablesDB;
  }

  /** Método principal para processar o jogo recebido do webhook */
  async upsertGame(game: IGDBGame) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: IGDBHandler.name,
        operation: 'webhook.igdb.upsert-game',
        metadata: {
          receivedGameId: game.id,
          gameName: game.name ?? null,
        },
      },
      async () => {
        let appwriteGameId = `igdb_${game.id}`;

        if (this.shouldIgnore(game)) {
          return {
            message: 'Jogo ignorado',
            success: true,
            noOp: true,
            reason: 'ignored_event',
          };
        }

        try {
          const parsedGame = this.parseBasicGame(game);
          appwriteGameId = await this.upsertService.upsertGameRow(parsedGame);

          await this.upsertService.ensureGameZStats(appwriteGameId);

          return {
            message: `O jogo ${game.name} foi registrado com sucesso`,
            success: true,
          };
        } catch {
          throw new ServiceUnavailableException('Erro ao processar o jogo');
        }
      },
    );
  }

  /** Métodos para processar gêneros */
  async upsertGenre(genre: IGDBGenre) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: IGDBHandler.name,
        operation: 'webhook.igdb.upsert-genre',
        metadata: {
          genreId: genre.id,
          genreName: genre.name,
        },
      },
      async () => {
        try {
          await this.upsertService.upsertGenre(genre);

          return {
            message: `Gênero ${genre.name} processado com sucesso`,
            success: true,
          };
        } catch {
          throw new ServiceUnavailableException('Erro ao processar o gênero');
        }
      },
    );
  }

  /* Método para processar exclusão de gêneros */
  async deleteGenre(genre: IGDBGenre) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: IGDBHandler.name,
        operation: 'webhook.igdb.delete-genre',
        metadata: {
          genreId: genre.id,
          genreName: genre.name,
        },
      },
      async () => {
        try {
          await this.upsertService.deleteGenre(genre);

          return {
            message: `Gênero ${genre.name} deletado com sucesso`,
            success: true,
          };
        } catch {
          throw new ServiceUnavailableException('Erro ao deletar o gênero');
        }
      },
    );
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
      involvedCompanies: this.extractInvolvedCompanies(game),
      syncStage: GamesSyncStage.BASIC,
    };
  }

  private extractInvolvedCompanies(game: IGDBGame): string[] {
    const companies = game.involved_companies ?? [];
    const ids = companies
      .filter((item) => item.developer && item.company?.id)
      .map((item) => `igdb_${item.company.id}`);

    return Array.from(new Set(ids));
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
