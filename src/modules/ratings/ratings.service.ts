import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ID, Query, Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { ZCoinsService } from '../zcoins/zcoins.service';
import { CreateRatingDto } from './ratings.dto';
import type { UserProfiles } from 'src/common/appwrite/appwrite';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'ratings';

  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly zCoinsService: ZCoinsService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async getProfileByUserId(userId: string): Promise<UserProfiles> {
    const result = await this.tablesDB.listRows<UserProfiles>({
      databaseId: RatingsService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });

    const profile = result.rows[0];
    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }
    return profile;
  }

  async upsertRating(userId: string, gameId: string, dto: CreateRatingDto) {
    const gameResult = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: 'games',
      queries: [Query.equal('$id', gameId), Query.limit(1)],
    });
    const game = gameResult.rows[0];
    if (!game) {
      throw new NotFoundException('Jogo não encontrado');
    }

    if (game.releaseDate && new Date(game.releaseDate) > new Date()) {
      throw new BadRequestException('Jogos não lançados não podem ser avaliados');
    }

    const profile = await this.getProfileByUserId(userId);
    const fingerprint = profile.fingerprint;

    // Verificar se já existe avaliação
    const existing = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      queries: [
        Query.equal('ownerFingerprint', fingerprint),
        Query.equal('gameId', gameId),
        Query.limit(1),
      ],
    });

    const hasPriorRating = existing.total > 0;
    const prior = existing.rows[0];

    const data: any = {
      ownerFingerprint: fingerprint,
      gameId,
      rating: dto.rating,
      title: dto.title || null,
      content: dto.content || null,
    };

    let result: any;
    try {
      if (hasPriorRating) {
        result = await this.tablesDB.updateRow({
          databaseId: RatingsService.DB_ID,
          tableId: RatingsService.TABLE_ID,
          rowId: prior.$id,
          data,
        });
      } else {
        result = await this.tablesDB.createRow({
          databaseId: RatingsService.DB_ID,
          tableId: RatingsService.TABLE_ID,
          rowId: ID.unique(),
          data,
        });

        // Se for uma nova avaliação, conceder Z-Coins
        try {
          // Se houver review longo/estruturado (content), concede o bônus de write_review (5 Z-Coins), senão engaged (1 Z-Coin)
          const reason = dto.content && dto.content.trim().length > 100 ? 'write_review' : 'engaged';
          await this.zCoinsService.applyInput(userId, reason);
        } catch (err) {
          this.logger.error(`Falha ao conceder Z-Coins para avaliação de ${userId}:`, err);
        }
      }

      // Atualizar as estatísticas do jogo
      const ratingDiff = hasPriorRating ? dto.rating - prior.rating : dto.rating;
      await this.updateGameRatingStats(gameId, ratingDiff, !hasPriorRating, false);

    } catch (err: any) {
      this.logger.error('Appwrite Error in upsertRating:', err);
      if (err.code === 400 && err.type === 'document_invalid_structure') {
        throw new BadRequestException('Erro de esquema no Appwrite: Provavelmente o atributo "content" não foi criado na coleção de avaliações.');
      }
      throw new BadRequestException(err.message || 'Erro ao salvar avaliação no Appwrite');
    }

    return {
      ...result,
      profile: {
        gamertag: profile.gamertag,
        avatarUrl: profile.avatarUrl,
      },
    };
  }

  private async updateGameRatingStats(gameId: string, ratingDiff: number, isNew: boolean, isDelete: boolean) {
    try {
      const gameResult = await this.tablesDB.listRows<any>({
        databaseId: RatingsService.DB_ID,
        tableId: 'games',
        queries: [Query.equal('$id', gameId), Query.limit(1)],
      });
      const game = gameResult.rows[0];
      if (!game) return;

      let newCount = game.ratingCount || 0;
      let newSum = game.ratingSum || 0;

      if (isDelete) {
        newCount = Math.max(0, newCount - 1);
        newSum = Math.max(0, newSum + ratingDiff);
      } else if (isNew) {
        newCount += 1;
        newSum += ratingDiff;
      } else {
        newSum += ratingDiff;
      }

      const newAvg = newCount > 0 ? newSum / newCount : 0;

      await this.tablesDB.updateRow({
        databaseId: RatingsService.DB_ID,
        tableId: 'games',
        rowId: gameId,
        data: {
          ratingCount: newCount,
          ratingSum: newSum,
          ratingAvg: newAvg,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to update rating stats for game ${gameId}:`, err);
    }
  }

  async getRatingByUserAndGame(userId: string, gameId: string) {
    const profile = await this.getProfileByUserId(userId);
    const result = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      queries: [
        Query.equal('ownerFingerprint', profile.fingerprint),
        Query.equal('gameId', gameId),
        Query.limit(1),
      ],
    });

    const rating = result.rows[0];
    if (!rating) {
      throw new NotFoundException('Avaliação não encontrada');
    }
    
    return {
      ...rating,
      profile: {
        gamertag: profile.gamertag,
        avatarUrl: profile.avatarUrl,
      },
    };
  }

  async getRatingsByGame(gameId: string, page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;

    const result = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      queries: [
        Query.equal('gameId', gameId),
        Query.orderDesc('$createdAt'),
        Query.limit(pageSize),
        Query.offset(offset),
      ],
    });

    if (result.rows.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    // Coletar fingerprints únicos para buscar os perfis dos usuários correspondentes
    const fingerprints = Array.from(new Set(result.rows.map((r) => r.ownerFingerprint)));

    // Buscar perfis
    const profilesResult = await this.tablesDB.listRows<UserProfiles>({
      databaseId: RatingsService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('fingerprint', fingerprints),
        Query.limit(fingerprints.length),
      ],
    });

    const profileMap = new Map<string, UserProfiles>();
    for (const p of profilesResult.rows) {
      profileMap.set(p.fingerprint, p);
    }

    // Mesclar avaliação com dados do perfil
    const items = result.rows.map((row) => {
      const p = profileMap.get(row.ownerFingerprint);
      return {
        ...row,
        profile: p ? {
          gamertag: p.gamertag,
          avatarUrl: p.avatarUrl,
        } : null,
      };
    });

    return {
      items,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async deleteRating(userId: string, gameId: string) {
    const profile = await this.getProfileByUserId(userId);
    const existing = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      queries: [
        Query.equal('ownerFingerprint', profile.fingerprint),
        Query.equal('gameId', gameId),
        Query.limit(1),
      ],
    });

    const rating = existing.rows[0];
    if (!rating) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    await this.tablesDB.deleteRow({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      rowId: rating.$id,
    });

    await this.updateGameRatingStats(gameId, -rating.rating, false, true);

    return { success: true };
  }

  async voteRating(userId: string, ratingId: string, operation: 'up' | 'down') {
    const ratingResult = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      queries: [Query.equal('$id', ratingId), Query.limit(1)],
    });
    const rating = ratingResult.rows[0];
    if (!rating) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    const existingVoteResult = await this.tablesDB.listRows<any>({
      databaseId: RatingsService.DB_ID,
      tableId: 'rating_votes',
      queries: [
        Query.equal('rating', ratingId),
        Query.equal('userId', userId),
        Query.limit(1),
      ],
    });
    const existingVote = existingVoteResult.rows[0];

    let delta = 0;
    if (!existingVote) {
      delta = operation === 'up' ? 1 : -1;
      await this.tablesDB.createRow({
        databaseId: RatingsService.DB_ID,
        tableId: 'rating_votes',
        rowId: ID.unique(),
        data: {
          type: operation,
          rating: ratingId,
          userId,
        },
      });
    } else if (existingVote.type === operation) {
      delta = operation === 'up' ? -1 : 1;
      await this.tablesDB.deleteRow({
        databaseId: RatingsService.DB_ID,
        tableId: 'rating_votes',
        rowId: existingVote.$id,
      });
    } else {
      delta = operation === 'up' ? 2 : -2;
      await this.tablesDB.updateRow({
        databaseId: RatingsService.DB_ID,
        tableId: 'rating_votes',
        rowId: existingVote.$id,
        data: {
          type: operation,
        },
      });
    }

    const newVoteCount = (rating.voteCount || 0) + delta;
    await this.tablesDB.updateRow({
      databaseId: RatingsService.DB_ID,
      tableId: RatingsService.TABLE_ID,
      rowId: ratingId,
      data: {
        voteCount: newVoteCount,
      },
    });

    return { success: true, delta, operation, newVoteCount };
  }
}
