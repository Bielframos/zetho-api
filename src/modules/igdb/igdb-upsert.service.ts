import { buildSearchDocument } from '../game/game-search.utils';
import { Injectable, Logger } from '@nestjs/common';
import { AppwriteException, Models, Query } from 'node-appwrite';
import type { GamesCreate } from 'src/infra/appwrite/appwrite-custom.types';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { IGDBGenre } from './igdb.types';

@Injectable()
export class IGDBUpsertService {
  private readonly logger = new Logger(IGDBUpsertService.name);
  private static readonly DB_ID = 'app';
  private tableDB: Appwrite['tablesDB'];

  constructor(
    private appwrite: Appwrite,
    private transactionService: TransactionService,
  ) {
    this.tableDB = this.appwrite.tablesDB;
  }

  async upsertGameRow(game: GamesCreate): Promise<string> {
    const preferredGameId = `igdb_${game.externalReference}`;

    try {
      await this.tableDB.createRow({
        databaseId: IGDBUpsertService.DB_ID,
        tableId: 'games',
        rowId: preferredGameId,
        data: game,
      });
      return preferredGameId;
    } catch (error) {
      const appwriteError = error as AppwriteException;
      if (appwriteError.code !== 409) {
        throw error;
      }
    }

    // Game already exists: compare checksum before updating
    const existing = await this.findExistingGame(
      game.externalReference,
      preferredGameId,
    );

    if (
      existing.syncStage === 'full' &&
      existing.checksum === (game.checksum ?? null)
    ) {
      return existing.$id;
    }

    game = {
      ...game,
      ...buildSearchDocument(
        game.name,
        game.searchAliases ?? existing.searchAliases ?? [],
        game.developerIds,
        game.publisherIds,
      ),
    };

    const { updatePayload, companiesChanged, nextCompanies } =
      this.buildSafeGameUpdatePayload(game, existing);

    if (companiesChanged) {
      // Use the new centralized TransactionService
      await this.transactionService.runInTransaction(async (ctx) => {
        // Clear companies first to avoid duplication
        await this.tableDB.updateRow({
          databaseId: IGDBUpsertService.DB_ID,
          tableId: 'games',
          rowId: existing.$id,
          data: { involvedCompanies: [] },
          transactionId: ctx.txId,
        });

        // Then apply the full update including nextCompanies
        await this.tableDB.updateRow({
          databaseId: IGDBUpsertService.DB_ID,
          tableId: 'games',
          rowId: existing.$id,
          data: {
            ...updatePayload,
            involvedCompanies: nextCompanies,
          } as GamesCreate,
          transactionId: ctx.txId,
        });
      });
    } else {
      // If companies haven't changed, we can just do a normal update
      await this.tableDB.updateRow({
        databaseId: IGDBUpsertService.DB_ID,
        tableId: 'games',
        rowId: existing.$id,
        data: updatePayload,
      });
    }

    return existing.$id;
  }

  async ensureGameZStats(gameId: string): Promise<void> {
    const zstatsId = `zstats_${gameId}`;

    try {
      await this.tableDB.createRow({
        databaseId: IGDBUpsertService.DB_ID,
        tableId: 'z_entry_count',
        rowId: zstatsId,
        data: { game: gameId },
      });
    } catch (error) {
      const appwriteError = error as AppwriteException;
      if (appwriteError.code !== 409) {
        throw error;
      }
    }
  }

  async upsertGenre(genre: IGDBGenre): Promise<void> {
    await this.tableDB.upsertRow({
      databaseId: IGDBUpsertService.DB_ID,
      tableId: 'genres',
      rowId: `igdb_${genre.id}`,
      data: {
        name: genre.name,
        slug: genre.slug,
        checksum: genre.checksum,
      },
    });
  }

  async deleteGenre(genre: IGDBGenre): Promise<void> {
    await this.tableDB.deleteRow({
      databaseId: IGDBUpsertService.DB_ID,
      tableId: 'genres',
      rowId: `igdb_${genre.id}`,
    });
  }

  private async findExistingGame(
    externalReference: number,
    fallbackId: string,
  ): Promise<{
    $id: string;
    checksum: string | null;
    involvedCompaniesIds: string[];
    searchAliases?: string[];
    syncStage?: string | null;
  }> {
    const response = await this.tableDB.listRows<
      Models.Row & {
        checksum?: string | null;
        searchAliases?: string[];
        syncStage?: string | null;
        involvedCompanies?: Array<{ $id?: string }>;
      }
    >({
      databaseId: IGDBUpsertService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('externalReference', externalReference),
        Query.select([
          '$id',
          'checksum',
          'syncStage',
          'searchAliases',
          'involvedCompanies.$id',
        ]),
        Query.limit(1),
      ],
    });

    const existing = response.rows[0];

    if (!existing) {
      return { $id: fallbackId, checksum: null, involvedCompaniesIds: [] };
    }

    const involvedCompaniesIds = (existing.involvedCompanies ?? [])
      .map((company) => company?.$id)
      .filter((companyId): companyId is string => !!companyId);

    return {
      $id: existing.$id,
      checksum: existing.checksum ?? null,
      searchAliases: existing.searchAliases,
      syncStage: existing.syncStage,
      involvedCompaniesIds,
    };
  }

  private buildSafeGameUpdatePayload(
    parsedGame: GamesCreate,
    existingGame: { involvedCompaniesIds: string[] },
  ): {
    updatePayload: GamesCreate;
    companiesChanged: boolean;
    nextCompanies: string[];
  } {
    const nextCompanies = (parsedGame.involvedCompanies ?? []).filter(
      (company): company is string => typeof company === 'string',
    );

    const currentIds = existingGame.involvedCompaniesIds;
    const currentSet = new Set(currentIds);
    const hasDuplicates = currentIds.length !== currentSet.size;
    const companiesChanged =
      hasDuplicates ||
      currentSet.size !== nextCompanies.length ||
      !nextCompanies.every((id) => currentSet.has(id));

    const { involvedCompanies: _, ...updatePayload } = parsedGame;

    return { updatePayload, companiesChanged, nextCompanies };
  }
}
