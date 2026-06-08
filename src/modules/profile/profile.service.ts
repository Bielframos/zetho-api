import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AppwriteException,
  ID,
  Models,
  Permission,
  Query,
  Role,
} from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import SCORE_TABLE from 'src/modules/zcoins/score-table';
import { ZCoinsService } from 'src/modules/zcoins/zcoins.service';

import crypto from 'node:crypto';
import type {
  UserProfiles,
  ZEntriesReadOnly,
} from 'src/common/appwrite/appwrite';

type ProfileAuditTotals = {
  totalsCompleted: number;
  totalsBacklog: number;
  totalsDropped: number;
  totalsPlaying: number;
  totalsWishlist: number;
  totalsHyped: number;
};

@Injectable()
export class ProfileService {
  private static readonly MONTHLY_BONUS_PER_INVITE = 5;
  private static readonly MONTHLY_BONUS_MAX_INVITES = 3;
  private static readonly DB_ID = 'app';

  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    private appwrite: Appwrite,
    private readonly zCoinsService: ZCoinsService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async create(user: Models.User, gamertag: string, inviteCode?: string) {
    const fingerprint = this.generateFingerprint(user.email);

    const existingProfile = await this.tablesDB.listRows<UserProfiles>({
      databaseId: ProfileService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('fingerprint', fingerprint),
        Query.select(['$id', 'inviteCode']),
        Query.limit(1),
      ],
    });

    if (existingProfile.total > 0) {
      const currProfile = existingProfile.rows[0];

      const updatedProfile = await this.tablesDB.updateRow<UserProfiles>({
        databaseId: ProfileService.DB_ID,
        tableId: 'user_profiles',
        rowId: currProfile.$id,
        data: {
          userId: user.$id,
          fingerprint,
          gamertag,
          inviteCode: currProfile.inviteCode ?? this.generateInviteCode(),
        },
        permissions: [Permission.update(Role.user(user.$id))],
      });

      return updatedProfile;
    }

    const createdProfile = await this.tablesDB.createRow<
      Models.Row & {
        userId: string;
        fingerprint: string;
        gamertag: string;
        inviteCode: string | null;
      }
    >({
      databaseId: ProfileService.DB_ID,
      tableId: 'user_profiles',
      rowId: ID.unique(),
      data: {
        userId: user.$id,
        fingerprint,
        gamertag,
        inviteCode: this.generateInviteCode(),
      },
      permissions: [Permission.update(Role.user(user.$id))],
    });

    await this.applyWelcomeBonus(user.$id);

    await this.applyInviteReward({
      invitedUserId: user.$id,
      invitedProfileId: createdProfile.$id,
      inviteCode,
    });

    return createdProfile;
  }

  private async applyWelcomeBonus(userId: string) {
    await this.zCoinsService.applyInput(userId, 'welcome_bonus');
  }

  async getMonthlyInviteBonus(userId: string) {
    const period = this.getCurrentMonthPeriod();
    const invitedUserIds = await this.getInvitedUsersInPeriod(
      userId,
      period.start,
    );

    const invitedUsersCount = invitedUserIds.size;
    const eligibleInvites = Math.min(
      invitedUsersCount,
      ProfileService.MONTHLY_BONUS_MAX_INVITES,
    );
    const bonusPercent =
      eligibleInvites * ProfileService.MONTHLY_BONUS_PER_INVITE;

    return {
      period: {
        start: period.start,
        endExclusive: period.endExclusive,
      },
      invitedUsersCount,
      eligibleInvites,
      bonusPercent,
      maxBonusPercent:
        ProfileService.MONTHLY_BONUS_MAX_INVITES *
        ProfileService.MONTHLY_BONUS_PER_INVITE,
    };
  }

  async listProfiles(page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;

    const response = await this.tablesDB.listRows<UserProfiles>({
      databaseId: ProfileService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.orderDesc('$createdAt'),
        Query.limit(safeLimit),
        Query.offset(offset),
      ],
    });

    return {
      items: response.rows,
      page: safePage,
      limit: safeLimit,
      total: response.total,
      totalPages: Math.max(1, Math.ceil(response.total / safeLimit)),
    };
  }

  async updateInviteCode(profileId: string) {
    const inviteCode = this.generateInviteCode();

    try {
      const updated = await this.tablesDB.updateRow<UserProfiles>({
        databaseId: ProfileService.DB_ID,
        tableId: 'user_profiles',
        rowId: profileId,
        data: { inviteCode },
      });

      return {
        profileId: updated.$id,
        inviteCode: updated.inviteCode,
      };
    } catch (e) {
      if (e instanceof AppwriteException) {
        if (e.code === 404) {
          throw new NotFoundException('Perfil não encontrado');
        }

        throw new HttpException(e.message, e.code);
      }

      throw new InternalServerErrorException(
        'Erro ao atualizar código de convite',
      );
    }
  }

  async auditProfileById(profileId: string, fix = false) {
    let profile: UserProfiles;

    try {
      profile = await this.tablesDB.getRow<UserProfiles>({
        databaseId: ProfileService.DB_ID,
        tableId: 'user_profiles',
        rowId: profileId,
      });
    } catch {
      throw new NotFoundException('Perfil não encontrado');
    }

    return await this.auditSingleProfile(profile, fix);
  }

  async auditAllProfiles(fix = false) {
    const pageSize = 100;
    let offset = 0;
    const reports: Awaited<ReturnType<typeof this.auditSingleProfile>>[] = [];
    let total = 0;

    while (true) {
      const page = await this.tablesDB.listRows<UserProfiles>({
        databaseId: ProfileService.DB_ID,
        tableId: 'user_profiles',
        queries: [Query.limit(pageSize), Query.offset(offset)],
      });

      total = page.total;

      if (page.rows.length === 0) {
        break;
      }

      const currentReports = await Promise.all(
        page.rows.map((profile) => this.auditSingleProfile(profile, fix)),
      );

      reports.push(...currentReports);
      offset += page.rows.length;

      if (offset >= page.total) {
        break;
      }
    }

    const mismatched = reports.filter((report) => report.shouldFix).length;
    const fixed = reports.filter((report) => report.fixed).length;

    return {
      totalProfiles: total,
      auditedProfiles: reports.length,
      mismatchedProfiles: mismatched,
      fixedProfiles: fixed,
      fixApplied: fix,
      reports,
    };
  }

  private async auditSingleProfile(profile: UserProfiles, fix = false) {
    const actualTotals = await this.countProfileTotals(profile.fingerprint);
    const storedTotals = this.getStoredTotals(profile);

    const mismatchFields = (
      Object.keys(storedTotals) as (keyof ProfileAuditTotals)[]
    ).filter((key) => storedTotals[key] !== actualTotals[key]);

    const shouldFix = mismatchFields.length > 0;
    let fixed = false;

    if (fix && shouldFix) {
      await this.tablesDB.updateRow<UserProfiles>({
        databaseId: ProfileService.DB_ID,
        tableId: 'user_profiles',
        rowId: profile.$id,
        data: actualTotals,
      });
      fixed = true;
    }

    return {
      profileId: profile.$id,
      userId: profile.userId,
      gamertag: profile.gamertag,
      fingerprint: profile.fingerprint,
      storedTotals,
      actualTotals,
      mismatchFields,
      shouldFix,
      fixed,
    };
  }

  private getStoredTotals(profile: UserProfiles): ProfileAuditTotals {
    return {
      totalsCompleted: profile.totalsCompleted ?? 0,
      totalsBacklog: profile.totalsBacklog ?? 0,
      totalsDropped: profile.totalsDropped ?? 0,
      totalsPlaying: profile.totalsPlaying ?? 0,
      totalsWishlist: profile.totalsWishlist ?? 0,
      totalsHyped: profile.totalsHyped ?? 0,
    };
  }

  private async countProfileTotals(
    fingerprint: string,
  ): Promise<ProfileAuditTotals> {
    const totals: ProfileAuditTotals = {
      totalsCompleted: 0,
      totalsBacklog: 0,
      totalsDropped: 0,
      totalsPlaying: 0,
      totalsWishlist: 0,
      totalsHyped: 0,
    };

    const limit = 500;
    let offset = 0;

    while (true) {
      const page = await this.tablesDB.listRows<ZEntriesReadOnly>({
        databaseId: ProfileService.DB_ID,
        tableId: 'z_entries_read',
        queries: [
          Query.equal('ownerFingerprint', fingerprint),
          Query.select(['status', 'hyped']),
          Query.limit(limit),
          Query.offset(offset),
        ],
      });

      for (const entry of page.rows) {
        const status = entry.status as string | null;

        if (entry.hyped === true || status === 'hyped') {
          totals.totalsHyped += 1;
        }

        switch (status) {
          case 'completed':
            totals.totalsCompleted += 1;
            break;
          case 'backlog':
            totals.totalsBacklog += 1;
            break;
          case 'dropped':
            totals.totalsDropped += 1;
            break;
          case 'playing':
            totals.totalsPlaying += 1;
            break;
          case 'wishlist':
            totals.totalsWishlist += 1;
            break;
          default:
            break;
        }
      }

      offset += page.rows.length;

      if (offset >= page.total || page.rows.length === 0) {
        break;
      }
    }

    return totals;
  }

  private normalizeEmail(email: string) {
    email = email.trim().toLowerCase();
    const [local, domain] = email.split('@');

    if (domain === 'gmail.com') {
      return local.replace(/\./g, '').split('+')[0] + '@gmail.com';
    }

    return email;
  }

  private generateFingerprint(email: string) {
    const normalized = this.normalizeEmail(email);
    return crypto.createHash('sha256').update(normalized).digest('base64url');
  }

  private generateInviteCode() {
    return crypto.randomBytes(6).toString('base64url');
  }

  private async applyInviteReward(params: {
    invitedUserId: string;
    invitedProfileId: string;
    inviteCode?: string;
  }) {
    const rawInviteCode = params.inviteCode?.trim();

    if (!rawInviteCode) {
      return;
    }

    const inviterResult = await this.tablesDB.listRows<UserProfiles>({
      databaseId: ProfileService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('inviteCode', rawInviteCode), Query.limit(1)],
    });

    const inviterProfile = inviterResult.rows[0];

    if (!inviterProfile || !inviterProfile.userId) {
      throw new BadRequestException('Código de convite inválido');
    }

    if (inviterProfile.userId === params.invitedUserId) {
      throw new BadRequestException(
        'Não é possível utilizar o próprio código de convite',
      );
    }

    const logRowId = this.generateInviteLogRowId(
      inviterProfile.userId,
      params.invitedUserId,
    );

    let inviteAlreadyUsed = false;

    try {
      await this.tablesDB.getRow({
        databaseId: 'app',
        tableId: 'app_logs',
        rowId: logRowId,
      });
      inviteAlreadyUsed = true;
    } catch (error) {
      if (error instanceof AppwriteException && error.code !== 404) {
        throw error;
      }
    }

    if (inviteAlreadyUsed) {
      throw new ConflictException('Convite já utilizado para este usuário');
    }

    const rewardAmount = SCORE_TABLE.input.friend_joined;
    const tx = await this.tablesDB.createTransaction();

    try {
      await this.tablesDB.createOperations({
        transactionId: tx.$id,
        operations: [
          {
            action: 'increment',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: inviterProfile.$id,
            data: { value: rewardAmount, column: 'zcoinBalance' },
          },
        ],
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId: crypto.randomUUID(),
        data: {
          userId: inviterProfile.userId,
          amount: rewardAmount,
          type: 'input',
          reason: 'friend_joined',
        },
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'app_logs',
        rowId: logRowId,
        data: {
          type: 'invite_applied',
          relatedUserId: inviterProfile.userId,
          metadata: JSON.stringify({
            inviteCode: rawInviteCode,
            invitedUserId: params.invitedUserId,
            invitedProfileId: params.invitedProfileId,
            inviterProfileId: inviterProfile.$id,
            rewardAmount,
          }),
        },
      });

      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        commit: true,
      });
    } catch (error) {
      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        rollback: true,
      });
      throw error;
    }
  }

  private generateInviteLogRowId(inviterUserId: string, invitedUserId: string) {
    return crypto
      .createHash('sha256')
      .update(`${inviterUserId}:${invitedUserId}`)
      .digest('hex')
      .slice(0, 32);
  }

  private getCurrentMonthPeriod() {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const endExclusive = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );

    return {
      start: start.toISOString(),
      endExclusive: endExclusive.toISOString(),
    };
  }

  private async getInvitedUsersInPeriod(userId: string, start: string) {
    const invitedUserIds = new Set<string>();
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const page = await this.tablesDB.listRows<
        Models.Row & { metadata?: string; relatedUserId?: string }
      >({
        databaseId: 'app',
        tableId: 'app_logs',
        queries: [
          Query.equal('type', 'invite_applied'),
          Query.equal('relatedUserId', userId),
          Query.greaterThanEqual('$createdAt', start),
          Query.select(['metadata']),
          Query.limit(pageSize),
          Query.offset(offset),
        ],
      });

      for (const row of page.rows) {
        if (!row.metadata) {
          continue;
        }

        try {
          const parsed = JSON.parse(row.metadata) as {
            invitedUserId?: string;
          };

          if (parsed.invitedUserId) {
            invitedUserIds.add(parsed.invitedUserId);
          }
        } catch {
          // Ignora logs com metadata inválida.
        }
      }

      offset += page.rows.length;

      if (offset >= page.total || page.rows.length === 0) {
        break;
      }
    }

    return invitedUserIds;
  }
}
