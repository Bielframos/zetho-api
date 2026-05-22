import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AppwriteException, Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

import crypto from 'node:crypto';
import { UserProfiles, ZEntriesReadOnly } from 'infra/appwrite';

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
  private userProfiles: Appwrite['databases']['userProfiles'];
  private zEntriesReadonly: Appwrite['databases']['zEntriesReadonly'];

  constructor(private appwrite: Appwrite) {
    this.userProfiles = this.appwrite.databases.userProfiles;
    this.zEntriesReadonly = this.appwrite.databases.zEntriesReadonly;
  }

  async create(user: Models.User, gamertag: string) {
    const fingerprint = this.generateFingerprint(user.email);

    const existingProfile = await this.userProfiles.list({
      queries: (q) => [
        q.equal('fingerprint', fingerprint),
        q.select(['$id']),
        q.limit(1),
      ],
    });

    if (existingProfile.total > 0) {
      const currProfile = existingProfile.rows[0];

      return await this.userProfiles.update(
        currProfile.$id,
        {
          userId: user.$id,
          fingerprint,
          gamertag,
          inviteCode: currProfile.inviteCode ?? this.generateInviteCode(),
        },
        { permissions: (p, r) => [p.update(r.user(user.$id))] },
      );
    }

    return await this.userProfiles.create(
      {
        userId: user.$id,
        fingerprint,
        gamertag,
        inviteCode: this.generateInviteCode(),
      },
      { permissions: (p, r) => [p.update(r.user(user.$id))] },
    );
  }

  async listProfiles(page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;

    const response = await this.userProfiles.list({
      queries: (q) => [
        q.orderDesc('$createdAt'),
        q.limit(safeLimit),
        q.offset(offset),
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
      const updated = await this.userProfiles.update(profileId, { inviteCode });

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
      profile = await this.userProfiles.get(profileId);
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
      const page = await this.userProfiles.list({
        queries: (q) => [q.limit(pageSize), q.offset(offset)],
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
      await this.userProfiles.update(profile.$id, actualTotals);
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
      const page = await this.zEntriesReadonly.list({
        queries: (q) => [
          q.equal('ownerFingerprint', fingerprint),
          q.select(['status']),
          q.limit(limit),
          q.offset(offset),
        ],
      });

      for (const entry of page.rows as ZEntriesReadOnly[]) {
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
}
