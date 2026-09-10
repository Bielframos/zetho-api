import { GameSearchQueueService } from '../../igdb/game-search-queue.service';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppwriteException, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { IGDBGameWebhook, IGDBGenre } from '../../igdb/igdb.types';
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
    private readonly searchQueue: GameSearchQueueService,
  ) {
    this.tableDB = this.appwrite.tablesDB;
  }

  /** Método principal para processar o jogo recebido do webhook */
  async upsertGame(game: IGDBGameWebhook) {
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
          appwriteGameId = await this.searchQueue.registerBasic(game);

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

  private shouldIgnore(game: IGDBGameWebhook) {
    return (
      [3, 5, 7, 12, 13, 14].includes(game.game_type ?? 0) ||
      (game.version_parent !== undefined && game.version_parent !== null)
    );
  }
}
