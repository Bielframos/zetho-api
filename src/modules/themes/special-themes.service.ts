import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppwriteException, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';

const databaseId = 'app';
const themeTable = 'special_themes';
const claimTable = 'special_theme_claims';
const pageSize = 50;

interface SpecialThemeRow extends Models.Row {
  name: string;
  appearance: string;
  startsAt: string;
  endsAt: string;
}

interface ThemeClaimRow extends Models.Row {
  userId: string;
  themeId: string;
}

function themeSummary(row: SpecialThemeRow) {
  return { id: row.$id, name: row.name, appearance: row.appearance };
}

function campaign(row: SpecialThemeRow, now: number) {
  const starts = Date.parse(row.startsAt);
  const ends = Date.parse(row.endsAt);
  const status =
    !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts
      ? 'ended'
      : now < starts
        ? 'upcoming'
        : now < ends
          ? 'open'
          : 'ended';
  return {
    ...themeSummary(row),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    serverTime: new Date(now).toISOString(),
    status,
  } as const;
}

@Injectable()
export class SpecialThemesService {
  constructor(private readonly appwrite: Appwrite) {}

  async getCampaign(id: string) {
    return campaign(await this.getTheme(id), Date.now());
  }

  async listOwned(userId: string) {
    const owned: ReturnType<typeof themeSummary>[] = [];
    let cursor: string | undefined;
    do {
      const { rows } = await this.appwrite.tablesDB.listRows<ThemeClaimRow>({
        databaseId,
        tableId: claimTable,
        queries: [
          Query.equal('userId', userId),
          Query.limit(pageSize),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
        total: false,
      });
      if (rows.length === 0) break;
      const { rows: themes } =
        await this.appwrite.tablesDB.listRows<SpecialThemeRow>({
          databaseId,
          tableId: themeTable,
          queries: [
            Query.equal('$id', [...new Set(rows.map((row) => row.themeId))]),
            Query.limit(pageSize),
          ],
          total: false,
        });
      owned.push(...themes.map(themeSummary));
      cursor = rows.length === pageSize ? rows.at(-1)?.$id : undefined;
    } while (cursor);
    return owned.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async claim(userId: string, id: string) {
    const row = await this.getTheme(id);
    const rowId = createHash('sha256')
      .update(JSON.stringify([userId, id]))
      .digest('hex')
      .slice(0, 36);

    // Retries and users who already own the theme can recover the same result.
    try {
      await this.appwrite.tablesDB.getRow<ThemeClaimRow>({
        databaseId,
        tableId: claimTable,
        rowId,
      });
      return themeSummary(row);
    } catch (error) {
      if (!(error instanceof AppwriteException) || error.code !== 404)
        throw error;
    }

    const { status } = campaign(row, Date.now());
    if (status !== 'open') {
      throw new ConflictException(
        status === 'upcoming'
          ? 'O resgate ainda não começou.'
          : 'O período de resgate terminou.',
      );
    }

    try {
      await this.appwrite.tablesDB.createRow<ThemeClaimRow>({
        databaseId,
        tableId: claimTable,
        rowId,
        data: { userId, themeId: id },
      });
    } catch (error) {
      // The deterministic row ID makes simultaneous claims converge.
      if (!(error instanceof AppwriteException) || error.code !== 409)
        throw error;
    }
    return themeSummary(row);
  }

  private async getTheme(id: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,35}$/.test(id))
      throw new NotFoundException('Tema especial não encontrado.');
    try {
      return await this.appwrite.tablesDB.getRow<SpecialThemeRow>({
        databaseId,
        tableId: themeTable,
        rowId: id,
      });
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 404)
        throw new NotFoundException('Tema especial não encontrado.');
      throw error;
    }
  }
}
