import {
  BadRequestException,
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
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import SCORE_TABLE from 'src/modules/zcoins/score-table';

import crypto from 'node:crypto';
import type {
  UserProfiles,
  UserProfilesStatus,
  ZEntriesReadOnly,
} from 'src/infra/appwrite/appwrite';

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
    private readonly transactionService: TransactionService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async updateMe(userId: string, data: any) {
    const profiles = await this.tablesDB.listRows<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    const profile = profiles.rows[0];
    if (!profile) throw new NotFoundException('Perfil não encontrado');
    const allowed = [
      'gamertag',
      'avatarUrl',
      'bio',
      'socialXbox',
      'socialSteam',
      'socialPsn',
      'socialNintendo',
    ];
    const clean = Object.fromEntries(
      allowed
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key]]),
    );
    if (!Object.keys(clean).length)
      throw new BadRequestException('Nenhum campo editável');
    return this.tablesDB.updateRow<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: profile.$id,
      data: clean,
    });
  }

  async requestDeletion(userId: string) {
    const profiles = await this.tablesDB.listRows<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    const profile = profiles.rows[0];
    if (!profile) throw new NotFoundException('Perfil não encontrado');
    return this.tablesDB.updateRow<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: profile.$id,
      data: {
        status: 'pending_deletion' as UserProfilesStatus,
        deletedAt: new Date().toISOString(),
      },
    });
  }

  async create(
    user: Models.User,
    gamertag: string,
    inviteCode?: string,
    attempt = 0,
  ): Promise<any> {
    if (
      inviteCode !== undefined &&
      (typeof inviteCode !== 'string' || inviteCode.length > 64)
    )
      throw new BadRequestException('Código de convite inválido');
    const fingerprint = this.generateFingerprint(user.email);
    const receiptId = crypto
      .createHash('sha256')
      .update(`registration:${user.$id}`)
      .digest('hex')
      .slice(0, 36);
    try {
      const existing = await this.tablesDB.listRows<UserProfiles>({
        databaseId: 'app',
        tableId: 'user_profiles',
        queries: [Query.equal('fingerprint', fingerprint), Query.limit(1)],
      });
      let receipt: any = null;
      try {
        receipt = await this.tablesDB.getRow({
          databaseId: 'app',
          tableId: 'app_logs',
          rowId: receiptId,
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 404) throw error;
      }
      let profile: any = existing.rows[0];
      if (profile?.userId && profile.userId !== user.$id)
        throw new BadRequestException('Perfil já vinculado a outra conta');
      if (profile && (!receipt || receipt.type === 'registration_complete')) {
        // Existing/legacy accounts are never new signups and cannot claim an invitation again.
        return {
          ...profile,
          registration: { created: false, inviteAccepted: false },
        };
      }
      if (!profile) {
        if (
          typeof gamertag !== 'string' ||
          !/^[a-zA-Z0-9_]{3,128}$/.test(gamertag)
        )
          throw new BadRequestException('Gamertag inválida');
        // Reject invalid/self/deleted invitations before persisting a profile or granting rewards.
        if (inviteCode?.trim())
          await this.resolveInviter(inviteCode.trim(), user.$id);
        profile = await this.transactionService.runInTransaction(
          async ({ txId }) => {
            const created = await this.tablesDB.createRow<any>({
              databaseId: 'app',
              tableId: 'user_profiles',
              rowId: ID.unique(),
              transactionId: txId,
              data: {
                userId: user.$id,
                fingerprint,
                gamertag,
                inviteCode: this.generateInviteCode(),
              },
              permissions: [Permission.read(Role.any())],
            });
            await this.tablesDB.createRow({
              databaseId: 'app',
              tableId: 'app_logs',
              rowId: receiptId,
              transactionId: txId,
              data: {
                type: 'registration_pending',
                relatedUserId: user.$id,
                metadata: JSON.stringify({
                  inviteCode: inviteCode?.trim() || null,
                }),
              },
            });
            return created;
          },
        );
        receipt = {
          type: 'registration_pending',
          metadata: JSON.stringify({ inviteCode: inviteCode?.trim() || null }),
        };
      }
      const acceptedCode = JSON.parse(receipt.metadata).inviteCode ?? undefined;
      await this.applyWelcomeBonus(user.$id, profile.$id);
      let inviteAccepted = JSON.parse(receipt.metadata).inviteAccepted === true;
      if (!inviteAccepted) {
        try {
          inviteAccepted = await this.applyInviteReward({
            invitedUserId: user.$id,
            invitedProfileId: profile.$id,
            inviteCode: acceptedCode,
            registrationReceiptId: receiptId,
          });
        } catch (error) {
          // A code removed after validation must not strand the new account.
          // Infrastructure failures still propagate and remain resumable.
          if (!(error instanceof BadRequestException)) throw error;
          inviteAccepted = false;
        }
      }
      const created = await this.transactionService.runInTransaction(
        async ({ txId }) => {
          const current = await this.tablesDB.getRow<any>({
            databaseId: 'app',
            tableId: 'app_logs',
            rowId: receiptId,
            transactionId: txId,
          });
          if (current.type === 'registration_complete') return false;
          await this.tablesDB.updateRow({
            databaseId: 'app',
            tableId: 'app_logs',
            rowId: receiptId,
            transactionId: txId,
            data: {
              type: 'registration_complete',
              metadata: JSON.stringify({
                inviteAccepted: inviteAccepted === true,
              }),
            },
          });
          return true;
        },
      );
      return {
        ...profile,
        registration: { created, inviteAccepted: inviteAccepted === true },
      };
    } catch (error) {
      if ((error as { code?: number }).code === 409 && attempt < 2)
        return this.create(user, gamertag, inviteCode, attempt + 1);
      throw error;
    }
  }

  private async applyWelcomeBonus(userId: string, profileId: string) {
    const rowId = crypto
      .createHash('sha256')
      .update(`welcome:${userId}`)
      .digest('hex')
      .slice(0, 36);
    await this.transactionService.runInTransaction(async ({ txId }) => {
      try {
        await this.tablesDB.getRow({
          databaseId: 'app',
          tableId: 'zcoin_transactions',
          rowId,
          transactionId: txId,
        });
        return;
      } catch (error) {
        if ((error as { code?: number }).code !== 404) throw error;
      }
      const amount = SCORE_TABLE.input.welcome_bonus;
      await this.tablesDB.createOperations({
        transactionId: txId,
        operations: [
          {
            action: 'increment',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: profileId,
            data: { column: 'zcoinBalance', value: amount },
          },
        ],
      });
      await this.tablesDB.createRow({
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId,
        transactionId: txId,
        data: { userId, amount, type: 'input', reason: 'welcome_bonus' },
      });
    });
  }

  private async resolveInviter(code: string, userId: string) {
    const result = await this.tablesDB.listRows<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [Query.equal('inviteCode', code), Query.limit(1)],
    });
    const inviter = result.rows[0];
    if (!inviter?.userId || inviter.status === 'pending_deletion')
      throw new BadRequestException('Código de convite inválido');
    if (inviter.userId === userId)
      throw new BadRequestException(
        'Não é possível utilizar o próprio código de convite',
      );
    return inviter;
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

  /** Mini-perfil público do dono de um código de convite (para a tela de cadastro). */
  async getInviterByCode(code: string) {
    const trimmed = code?.trim();
    if (!trimmed) return null;

    const result = await this.tablesDB.listRows<UserProfiles>({
      databaseId: ProfileService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('inviteCode', trimmed),
        Query.limit(1),
        Query.select(['gamertag', 'avatarUrl', 'totalsCompleted']),
      ],
    });

    const inviter = result.rows[0];
    if (!inviter) return null;

    return {
      gamertag: inviter.gamertag,
      avatarUrl: inviter.avatarUrl ?? null,
      totalsCompleted: inviter.totalsCompleted ?? 0,
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
    registrationReceiptId: string;
  }) {
    const rawInviteCode = params.inviteCode?.trim();

    if (!rawInviteCode) {
      return false;
    }

    const inviterProfile = await this.resolveInviter(
      rawInviteCode,
      params.invitedUserId,
    );

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
      if ((error as { code?: number }).code !== 404) {
        throw error;
      }
    }

    if (inviteAlreadyUsed) {
      return true; // The committed reward is the source of truth on registration retry.
    }

    const rewardAmount = SCORE_TABLE.input.friend_joined;

    await this.transactionService.runInTransaction(async (ctx) => {
      await this.tablesDB.createOperations({
        transactionId: ctx.txId,
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
        transactionId: ctx.txId,
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
        transactionId: ctx.txId,
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
      await this.tablesDB.updateRow({
        databaseId: 'app',
        tableId: 'app_logs',
        rowId: params.registrationReceiptId,
        transactionId: ctx.txId,
        data: {
          metadata: JSON.stringify({
            inviteCode: rawInviteCode,
            inviteAccepted: true,
          }),
        },
      });
    });

    // Conexão mútua: o convidado nasce seguindo o convidante e vice-versa, para
    // que ambos tenham feed com vida desde o primeiro acesso (loop de convite).
    await this.createMutualConnection(
      params.invitedProfileId,
      inviterProfile.$id,
    );
    return true;
  }

  private async createMutualConnection(
    invitedProfileId: string,
    inviterProfileId: string,
  ) {
    const pairs = [
      {
        requesterProfileId: invitedProfileId,
        targetProfileId: inviterProfileId,
      },
      {
        requesterProfileId: inviterProfileId,
        targetProfileId: invitedProfileId,
      },
    ];

    for (const data of pairs) {
      try {
        await this.tablesDB.createRow({
          databaseId: 'app',
          tableId: 'connections',
          rowId: crypto.randomUUID(),
          data,
        });
      } catch (error) {
        // Não bloqueia o cadastro caso a conexão falhe (best-effort).
        console.error('Falha ao criar conexão de convite', error);
      }
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
