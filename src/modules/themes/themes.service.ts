import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ID, Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { ProfileThemes, UserProfiles } from 'src/infra/appwrite/appwrite';
import { ZCoinsService } from '../zcoins/zcoins.service';
import { CreateThemeDto } from './themes.dto';

@Injectable()
export class ThemesService {
  private static readonly DB_ID = 'app';
  private readonly logger = new Logger(ThemesService.name);

  constructor(
    private readonly appwrite: Appwrite,
    private readonly zcoinsService: ZCoinsService,
  ) {}

  async listThemes() {
    const response = await this.appwrite.tablesDB.listRows<ProfileThemes>({
      databaseId: ThemesService.DB_ID,
      tableId: 'profile_themes',
      queries: [Query.limit(100), Query.orderDesc('$createdAt')],
    });
    return response.rows;
  }

  async createTheme(
    dto: CreateThemeDto,
    file?: { buffer: Buffer; originalname: string; mimetype?: string },
  ) {
    const backgroundImageId =
      dto.backgroundImageId ??
      (file ? await this.uploadThemeImage(file) : null);

    return this.appwrite.tablesDB.createRow<ProfileThemes>({
      databaseId: ThemesService.DB_ID,
      tableId: 'profile_themes',
      rowId: ID.unique(),
      data: {
        name: dto.name,
        type: dto.type,
        price: dto.price,
        backgroundImageId,
        backgroundColor: dto.backgroundColor || null,
        primaryColor: dto.primaryColor || null,
        secondaryColor: dto.secondaryColor || null,
        tertiaryColor: dto.tertiaryColor || null,
        gameId: dto.gameId || null,
      },
    });
  }

  private async uploadThemeImage(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  }) {
    const bucketId = process.env.APPWRITE_THEMES_BUCKET_ID ?? 'zetho-themes';
    const uploaded = await this.appwrite.storage.createFile({
      bucketId,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(file.buffer, file.originalname),
    });

    return uploaded.$id;
  }

  async buyTheme(userId: string, themeId: string) {
    const profileResponse = await this.appwrite.tablesDB.listRows<UserProfiles>(
      {
        databaseId: ThemesService.DB_ID,
        tableId: 'user_profiles',
        queries: [Query.equal('userId', userId), Query.limit(1)],
      },
    );

    if (profileResponse.total === 0) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const profile = profileResponse.rows[0];

    const theme = await this.appwrite.tablesDB.getRow<ProfileThemes>({
      databaseId: ThemesService.DB_ID,
      tableId: 'profile_themes',
      rowId: themeId,
    });

    if (!theme) {
      throw new NotFoundException('Tema não encontrado');
    }

    const unlocked = profile.unlockedThemes || [];
    if (unlocked.includes(themeId)) {
      throw new BadRequestException('Você já possui este tema');
    }

    // Debit zcoins using custom output
    await this.zcoinsService.applyCustomOutput(
      userId,
      'purchase_theme',
      theme.price,
    );

    try {
      // Add to unlocked
      unlocked.push(themeId);
      await this.appwrite.tablesDB.updateRow({
        databaseId: ThemesService.DB_ID,
        tableId: 'user_profiles',
        rowId: profile.$id,
        data: { unlockedThemes: unlocked },
      });
    } catch (error) {
      this.logger.error(
        `Failed to unlock theme ${themeId} for user ${userId}. Refunding ${theme.price} Z-Coins.`,
        error instanceof Error ? error.stack : String(error),
      );
      try {
        await this.zcoinsService.applyCustomInput(
          userId,
          'refund_purchase_theme',
          theme.price,
        );
      } catch (refundError) {
        this.logger.error(
          `Critical: Failed to refund ${theme.price} Z-Coins to user ${userId} after theme purchase failure.`,
          refundError instanceof Error
            ? refundError.stack
            : String(refundError),
        );
      }
      throw error;
    }

    return { success: true, themeId };
  }

  async equipTheme(userId: string, themeId: string | null) {
    const profileResponse = await this.appwrite.tablesDB.listRows<UserProfiles>(
      {
        databaseId: ThemesService.DB_ID,
        tableId: 'user_profiles',
        queries: [Query.equal('userId', userId), Query.limit(1)],
      },
    );

    if (profileResponse.total === 0) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const profile = profileResponse.rows[0];

    if (themeId) {
      const unlocked = profile.unlockedThemes || [];
      if (!unlocked.includes(themeId)) {
        throw new BadRequestException('Você não possui este tema desbloqueado');
      }
    }

    await this.appwrite.tablesDB.updateRow({
      databaseId: ThemesService.DB_ID,
      tableId: 'user_profiles',
      rowId: profile.$id,
      data: { activeThemeId: themeId },
    });

    return { success: true, activeThemeId: themeId };
  }
}
