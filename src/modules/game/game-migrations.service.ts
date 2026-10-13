import { Injectable, Logger } from '@nestjs/common';
import { ID, Models } from 'node-appwrite';
import type { Games as Game } from 'src/infra/appwrite/appwrite';
import { GameMediasType } from 'src/infra/appwrite/appwrite.enums';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TranslatorService } from 'src/agents/translator/translator.service';
import { IGDBService } from '../igdb/igdb.service';

/** Versioned catalog upgrades with per-game in-process coordination. */
@Injectable()
export class GameMigrationsService {
  private readonly logger = new Logger(GameMigrationsService.name);
  private readonly currentVersion = 2;
  private static readonly DB_ID = 'app';
  private readonly tablesDB: Appwrite['tablesDB'];
  private readonly migrationPromises = new Map<string, Promise<void>>();

  constructor(
    appwrite: Appwrite,
    private readonly translatorService: TranslatorService,
    private readonly igdbService: IGDBService,
  ) {
    this.tablesDB = appwrite.tablesDB;
  }

  async upgrade(game: Game): Promise<void> {
    if ((game.zethoVersion ?? 0) >= this.currentVersion) return;
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
      const migration = this.migrations[v];
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

        await this.tablesDB.updateRow({
          databaseId: GameMigrationsService.DB_ID,
          tableId: 'games',
          rowId: game.$id,
          data: { summaryPt: translatedSummary, zethoVersion: 2 },
          transactionId: tx.$id,
        });

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
}
