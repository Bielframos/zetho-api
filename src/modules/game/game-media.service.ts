import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Query } from 'node-appwrite';
import type { GameMedias, Games as Game } from 'src/infra/appwrite/appwrite';
import { GameMediasType } from 'src/infra/appwrite/appwrite.enums';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { IGDBService } from '../igdb/igdb.service';

/** Catalog media queries, image selection and cover enrichment. */
@Injectable()
export class GameMediaService {
  private static readonly DB_ID = 'app';
  private static readonly IGDB_IMAGE_BASE =
    'https://images.igdb.com/igdb/image/upload';
  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    appwrite: Appwrite,
    private readonly igdbService: IGDBService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.tablesDB = appwrite.tablesDB;
  }

  async findMediasBySlug(slug: string) {
    const cacheKey = `game:medias:${slug}`;
    const cached =
      await this.cache.get<ReturnType<typeof this.buildMediaDtos>>(cacheKey);
    if (cached) return cached;

    const gameResult = await this.tablesDB.listRows<Game>({
      databaseId: GameMediaService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('slug', slug),
        Query.limit(1),
        Query.select(['$id']),
      ],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameMediaService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game', game.$id as any)],
    });

    const response = this.buildMediaDtos(mediasResult.rows);
    await this.cache.set(cacheKey, response);
    return response;
  }

  /**
   * Resolve a melhor imagem editorial disponível para um jogo, em cascata:
   * screenshot aleatório → key art → coverUrl (IGDB). Retorna `null` quando o
   * jogo não possui nenhuma imagem, deixando o chamador decidir o fallback
   * genérico (ex.: Unsplash). Não lança exceção por ausência de mídia.
   */
  async getEditorialImage(
    gameId: string,
  ): Promise<{ url: string; type: 'screenshot' | 'keyart' | 'cover' } | null> {
    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameMediaService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game', gameId as any)],
    });

    const screenshots = mediasResult.rows.filter(
      (m) => m.type === GameMediasType.SCREENSHOT,
    );
    if (screenshots.length) {
      const pick = screenshots[Math.floor(Math.random() * screenshots.length)];
      return {
        url: this.buildImageUrl('screenshot_big', pick.mediaId),
        type: 'screenshot',
      };
    }

    const artwork = mediasResult.rows.find(
      (m) => m.type === GameMediasType.KEY_ART,
    );
    if (artwork) {
      return {
        url: this.buildImageUrl('1080p', artwork.mediaId),
        type: 'keyart',
      };
    }

    const game = await this.tablesDB
      .listRows<Game>({
        databaseId: GameMediaService.DB_ID,
        tableId: 'games',
        queries: [
          Query.equal('$id', gameId),
          Query.limit(1),
          Query.select(['$id', 'coverUrl']),
        ],
      })
      .then((result) => result.rows[0])
      .catch(() => null);
    if (game?.coverUrl) {
      return { url: game.coverUrl, type: 'cover' };
    }

    return null;
  }

  async findHeroImageBySlug(slug: string) {
    const cacheKey = `game:hero:${slug}`;
    const cached = await this.cache.get<{ url: string; type: string }>(
      cacheKey,
    );
    if (cached) return cached;

    const gameResult = await this.tablesDB.listRows<Game>({
      databaseId: GameMediaService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('slug', slug),
        Query.limit(1),
        Query.select(['$id']),
      ],
    });

    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com slug "${slug}" não encontrado`);
    }

    const mediasResult = await this.tablesDB.listRows<GameMedias>({
      databaseId: GameMediaService.DB_ID,
      tableId: 'game_medias',
      queries: [Query.equal('game', game.$id as any)],
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

  async enrichCoverUrls(games: Game[]) {
    const basicGames = games.filter(
      (game) => game.syncStage === 'basic' && !game.coverUrl,
    );

    if (!basicGames.length) {
      return games;
    }

    const externalIds = basicGames.map((game) => game.externalReference);
    const igdbGames = await this.igdbService.getGamesByIds(
      externalIds,
      externalIds.length,
    );

    const coverMap = new Map<number, string>();
    for (const igdbGame of igdbGames) {
      if (igdbGame.cover?.image_id) {
        coverMap.set(
          igdbGame.id,
          `https://images.igdb.com/igdb/image/upload/t_cover_big/${igdbGame.cover.image_id}.jpg`,
        );
      }
    }

    const updates = basicGames
      .map((game) => {
        const coverUrl = coverMap.get(game.externalReference);
        if (!coverUrl) {
          return null;
        }

        return this.tablesDB.updateRow<Game>({
          databaseId: GameMediaService.DB_ID,
          tableId: 'games',
          rowId: game.$id,
          data: { coverUrl },
        });
      })
      .filter((operation): operation is Promise<Game> => operation !== null);

    await Promise.all(updates);

    return games.map((game) => {
      if (game.coverUrl) {
        return game;
      }

      const coverUrl = coverMap.get(game.externalReference);
      return coverUrl ? { ...game, coverUrl } : game;
    });
  }

  private buildImageUrl(size: string, hash: string) {
    return `${GameMediaService.IGDB_IMAGE_BASE}/t_${size}/${hash}.jpg`;
  }
}
