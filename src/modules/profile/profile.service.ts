import { Injectable } from '@nestjs/common';
import { Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

import crypto from 'node:crypto';
import { UserProfiles } from 'infra/appwrite';

@Injectable()
export class ProfileService {
  private userProfiles: Appwrite['databases']['userProfiles'];

  constructor(private appwrite: Appwrite) {
    this.userProfiles = this.appwrite.databases.userProfiles;
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

    let profile: UserProfiles;

    if (existingProfile.total > 0) {
      const currProfile = existingProfile.rows[0];

      return await this.userProfiles.update(
        currProfile.$id,
        {
          userId: user.$id,
          fingerprint,
          gamertag,
        },
        { permissions: (p, r) => [p.update(r.user(user.$id))] },
      );
    }

    return await this.userProfiles.create(
      {
        userId: user.$id,
        fingerprint,
        gamertag,
      },
      { permissions: (p, r) => [p.update(r.user(user.$id))] },
    );
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
}
