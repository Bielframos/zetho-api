import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ID, Models } from 'node-appwrite';
import type { Games as Game } from 'infra/appwrite';
import { GameMedias, GameMediasType } from 'infra/appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { IGDBService } from '../igdb/igdb.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly currentVersion = 1;

  private games: Appwrite['databases']['games'];
  private gameMedias: Appwrite['databases']['gameMedias'];
  private tablesDB: Appwrite['databases']['api'];

  /** In-process migration locks: prevents duplicate concurrent migrations */
  private readonly migrationPromises = new Map<string, Promise<void>>();

  private static readonly IGDB_IMAGE_BASE =
    'https://images.igdb.com/igdb/image/upload';

  constructor(
    private readonly appwrite: Appwrite,
    private readonly igdbService: IGDBService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.games = this.appwrite.databases.games;
    this.gameMedias = this.appwrite.databases.gameMedias;
    this.tablesDB = this.appwrite.databases.api;
  }

  async findBySlug(slug: string, select?: string) {
    const cacheKey = `game:slug:${slug}:${select ?? ''}`;
    const cached = await this.cache.get<Game>(cacheKey);
    if (cached) return cached;

    const fields = select
      ? (select
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean) as any[])
      : undefined;

    const result = await this.games.list({
      queries: (q) => [
        q.equal('slug', slug),
        q.limit(1),
        ...(fields?.length ? [q.select(fields)] : []),
      ],
    });

    const game = result.rows[0];

    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const version = game.zethoVersion ?? 0;
    if (version < this.currentVersion) {
      await this.applyMigrations(game);
    }

    await this.cache.set(cacheKey, game);
    return game;
  }

  async findMediasBySlug(slug: string) {
    const cacheKey = `game:medias:${slug}`;
    const cached =
      await this.cache.get<ReturnType<typeof this.buildMediaDtos>>(cacheKey);
    if (cached) return cached;

    const gameResult = await this.games.list({
      queries: (q) => [q.equal('slug', slug), q.limit(1), q.select(['$id'])],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.gameMedias.list({
      queries: (q) => [q.equal('game' as any, game.$id as any)],
    });

    const response = this.buildMediaDtos(mediasResult.rows);
    await this.cache.set(cacheKey, response);
    return response;
  }

  async findHeroImageBySlug(slug: string) {
    const cacheKey = `game:hero:${slug}`;
    const cached = await this.cache.get<{ url: string; type: string }>(
      cacheKey,
    );
    if (cached) return cached;

    const gameResult = await this.games.list({
      queries: (q) => [q.equal('slug', slug), q.limit(1), q.select(['$id'])],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.gameMedias.list({
      queries: (q) => [q.equal('game' as any, game.$id as any)],
    });

    const artwork = mediasResult.rows.find(
      (m) => m.type === GameMediasType.KEY_ART,
    );

    if (artwork) {
      const response = {
        url: this.buildImageUrl('1080p', artwork.mediaId),
        type: GameMediasType.KEY_ART,
      };
      await this.cache.set(cacheKey, response);
      return response;
    }

    const screenshot = mediasResult.rows.find(
      (m) => m.type === GameMediasType.SCREENSHOT,
    );

    if (screenshot) {
      const response = {
        url: this.buildImageUrl('1080p', screenshot.mediaId),
        type: GameMediasType.SCREENSHOT,
      };
      await this.cache.set(cacheKey, response);
      return response;
    }

    throw new NotFoundException(
      `Nenhuma imagem hero encontrada para "${slug}"`,
    );
  }

  private buildMediaDtos(medias: GameMedias[]) {
    return medias.map((m) => {
      if (m.type === GameMediasType.KEY_ART) {
        return { ...m, url: this.buildImageUrl('1080p', m.mediaId) };
      }
      if (m.type === GameMediasType.SCREENSHOT) {
        return { ...m, url: this.buildImageUrl('screenshot_big', m.mediaId) };
      }
      // VIDEO
      return { ...m, url: `https://www.youtube.com/watch?v=${m.mediaId}` };
    });
  }

  private buildImageUrl(size: string, hash: string) {
    return `${GameService.IGDB_IMAGE_BASE}/t_${size}/${hash}.jpg`;
  }

  private async applyMigrations(game: Game): Promise<void> {
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
      const migration = this.migrations[v as keyof typeof this.migrations];
      if (migration) {
        this.logger.log(`Aplicando migração v${v} para jogo ${game.$id}`);
        await migration(game);
      }
    }
  }

  private readonly migrations: Record<number, (game: Game) => Promise<void>> = {
    1: (game) => this.mediasMigration(game),
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
}
