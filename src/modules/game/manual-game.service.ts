import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AppwriteException, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { GamesSyncStage } from 'src/infra/appwrite/appwrite.enums';
import type { GamesCreate } from 'src/infra/appwrite/appwrite-custom.types';
import { IGDBUpsertService } from '../igdb/igdb-upsert.service';
import { buildSearchDocument } from './game-search.utils';
import { slugify } from 'src/common/utils/slugify';

export interface CreateManualGameDto {
  name: string;
  slug?: string;
  summary?: string;
  releaseYear?: string;
  releaseDate?: string;
  coverUrl?: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  aliases?: string[];
}

export interface ManualGameResult {
  success: boolean;
  action: 'created_manually';
  gameId: string;
  game: {
    $id: string;
    name: string;
    slug: string;
    externalReference: number;
    syncStage: string;
    releaseYear?: string | null;
    coverUrl?: string | null;
  };
}

@Injectable()
export class ManualGameService {
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'games';
  private readonly logger = new Logger(ManualGameService.name);
  private tableDB: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly upsertService: IGDBUpsertService,
  ) {
    this.tableDB = this.appwrite.tablesDB;
  }

  async createManualGame(dto: CreateManualGameDto): Promise<ManualGameResult> {
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('O nome do jogo é obrigatório.');
    }

    const uniqueSlug = await this.resolveUniqueSlug(dto.slug || trimmedName);

    // Tenta alocar um externalReference negativo único e persistir
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      const externalReference = await this.allocateNegativeExternalReference();
      const rowId = `manual_${Math.abs(externalReference)}`;

      const devCompanyId = dto.developer
        ? await this.ensureCompany(dto.developer)
        : null;
      const pubCompanyId = dto.publisher
        ? await this.ensureCompany(dto.publisher)
        : null;

      const companyIds = [devCompanyId, pubCompanyId].filter(
        (id): id is string => Boolean(id),
      );
      const uniqueCompanyIds = Array.from(new Set(companyIds));

      const searchAliases = dto.aliases ?? [];
      const devIds = devCompanyId ? [devCompanyId] : [];
      const pubIds = pubCompanyId ? [pubCompanyId] : [];

      const searchDocument = buildSearchDocument(
        trimmedName,
        searchAliases,
        devIds,
        pubIds,
      );

      const payload: GamesCreate = {
        name: trimmedName,
        slug: uniqueSlug,
        summary: dto.summary ? dto.summary.trim().slice(0, 1500) : null,
        releaseYear: dto.releaseYear?.trim() || null,
        releaseDate: dto.releaseDate || null,
        coverUrl: dto.coverUrl || null,
        genres: dto.genres || [],
        involvedCompanies: uniqueCompanyIds,
        externalReference,
        syncStage: GamesSyncStage.FULL,
        ...searchDocument,
      };

      try {
        await this.tableDB.createRow({
          databaseId: ManualGameService.DB_ID,
          tableId: ManualGameService.TABLE_ID,
          rowId,
          data: payload,
        });

        await this.upsertService.ensureGameZStats(rowId);

        this.logger.log(
          `Jogo manual criado com sucesso: ${rowId} (${uniqueSlug})`,
        );

        return {
          success: true,
          action: 'created_manually',
          gameId: rowId,
          game: {
            $id: rowId,
            name: payload.name,
            slug: uniqueSlug,
            externalReference,
            syncStage: 'full',
            releaseYear: payload.releaseYear,
            coverUrl: payload.coverUrl,
          },
        };
      } catch (error) {
        const appwriteError = error as AppwriteException;
        if (appwriteError.code === 409) {
          // Colisão de externalReference ou rowId concorrente: tenta novamente com o próximo ID
          this.logger.warn(
            `Colisão ao registrar jogo manual (ref: ${externalReference}). Tentando próximo ID (tentativa ${attempt}/${maxRetries})...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'Não foi possível alocar um identificador único para o jogo manual após várias tentativas.',
    );
  }

  private async resolveUniqueSlug(rawInput: string): Promise<string> {
    const baseSlug = slugify(rawInput) || 'jogo';
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.tableDB.listRows({
        databaseId: ManualGameService.DB_ID,
        tableId: ManualGameService.TABLE_ID,
        queries: [Query.equal('slug', candidate), Query.limit(1)],
      });

      if (existing.rows.length === 0) {
        return candidate;
      }

      counter++;
      candidate = `${baseSlug}-${counter}`;
    }
  }

  private async allocateNegativeExternalReference(): Promise<number> {
    const response = await this.tableDB.listRows<
      Models.Row & { externalReference: number }
    >({
      databaseId: ManualGameService.DB_ID,
      tableId: ManualGameService.TABLE_ID,
      queries: [
        Query.lessThan('externalReference', 0),
        Query.orderAsc('externalReference'),
        Query.limit(1),
      ],
    });

    const lowest = response.rows[0];
    if (!lowest || typeof lowest.externalReference !== 'number') {
      return -1;
    }

    // Se o menor for -10, o próximo será -11
    return lowest.externalReference - 1;
  }

  private async ensureCompany(name: string): Promise<string> {
    const rawSlug = slugify(name);
    // RowId must be <= 36 chars and start with letter
    const companyId = `c_${rawSlug}`.slice(0, 36);

    try {
      await this.tableDB.createRow({
        databaseId: ManualGameService.DB_ID,
        tableId: 'companies',
        rowId: companyId,
        data: {
          name: name.trim().slice(0, 98),
          slug: (rawSlug || companyId).slice(0, 120),
        },
      });
    } catch (error) {
      const appwriteError = error as AppwriteException;
      if (appwriteError.code !== 409) {
        this.logger.warn(
          `Não foi possível registrar empresa ${companyId}: ${appwriteError.message}`,
        );
      }
    }

    return companyId;
  }
}
