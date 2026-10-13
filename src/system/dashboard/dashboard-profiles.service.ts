import { Injectable, NotFoundException } from '@nestjs/common';
import { Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';

export type ProfileSummary = {
  $id: string;
  userId?: string;
  fingerprint: string;
  gamertag: string;
  avatarUrl: string | null;
};

@Injectable()
export class DashboardProfilesService {
  private static readonly DB_ID = 'app';

  constructor(private readonly appwrite: Appwrite) {}

  async byUserId(userId: string): Promise<ProfileSummary & { userId: string }> {
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardProfilesService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    const profile = result.rows[0];
    if (!profile)
      throw new NotFoundException('Perfil do usuário não encontrado');
    return profile;
  }

  async byIds(ids: string[]): Promise<ProfileSummary[]> {
    if (ids.length === 0) return [];
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardProfilesService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('$id', ids),
        Query.limit(ids.length),
        Query.select(['$id', 'userId', 'fingerprint', 'gamertag', 'avatarUrl']),
      ],
    });
    return result.rows;
  }

  async byFingerprints(fingerprints: string[]): Promise<ProfileSummary[]> {
    if (fingerprints.length === 0) return [];
    const result = await this.appwrite.tablesDB.listRows<any>({
      databaseId: DashboardProfilesService.DB_ID,
      tableId: 'user_profiles',
      queries: [
        Query.equal('fingerprint', fingerprints),
        Query.limit(fingerprints.length),
        Query.select(['$id', 'userId', 'fingerprint', 'gamertag', 'avatarUrl']),
      ],
    });
    return result.rows;
  }
}
