import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type {
  GameplaySessionParticipants,
  GameplaySessions,
  UserProfiles,
} from 'src/infra/appwrite/appwrite.d';
import { QueryGameplaySessionDto } from './dto/query-gameplay-session.dto';

@Injectable()
export class GameplaySessionQueriesService {
  private static readonly DB_ID = 'app';
  private static readonly SESSIONS_TABLE = 'gameplay_sessions';
  private static readonly PARTICIPANTS_TABLE = 'gameplay_session_participants';

  constructor(private readonly appwrite: Appwrite) {}

  async listSessions(userId: string, query: QueryGameplaySessionDto) {
    const profile = await this.getProfileByUserId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    let rows: GameplaySessions[] = [];

    if (query.type === 'my_sessions') {
      const [relations, hosted] = await Promise.all([
        this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
          databaseId: GameplaySessionQueriesService.DB_ID,
          tableId: GameplaySessionQueriesService.PARTICIPANTS_TABLE,
          queries: [
            Query.equal('profileId', profile.$id),
            Query.equal('status', 'confirmed'),
            Query.limit(100),
          ],
        }),
        this.appwrite.tablesDB.listRows<GameplaySessions>({
          databaseId: GameplaySessionQueriesService.DB_ID,
          tableId: GameplaySessionQueriesService.SESSIONS_TABLE,
          queries: [
            Query.equal('hostProfileId', profile.$id),
            Query.limit(100),
          ],
        }),
      ]);
      const ids = new Set([
        ...relations.rows.map((row) => row.sessionId),
        ...hosted.rows.map((row) => row.$id),
      ]);
      if (ids.size) {
        rows = (
          await this.appwrite.tablesDB.listRows<GameplaySessions>({
            databaseId: GameplaySessionQueriesService.DB_ID,
            tableId: GameplaySessionQueriesService.SESSIONS_TABLE,
            queries: [
              Query.equal('$id', [...ids]),
              ...(query.gameId ? [Query.equal('gameId', query.gameId)] : []),
              Query.limit(limit),
              Query.offset(offset),
            ],
          })
        ).rows;
      }
    } else if (query.type === 'invites') {
      const invites =
        await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
          databaseId: GameplaySessionQueriesService.DB_ID,
          tableId: GameplaySessionQueriesService.PARTICIPANTS_TABLE,
          queries: [
            Query.equal('profileId', profile.$id),
            Query.equal('status', 'invited'),
            Query.limit(100),
          ],
        });
      if (invites.rows.length) {
        rows = (
          await this.appwrite.tablesDB.listRows<GameplaySessions>({
            databaseId: GameplaySessionQueriesService.DB_ID,
            tableId: GameplaySessionQueriesService.SESSIONS_TABLE,
            queries: [
              Query.equal(
                '$id',
                invites.rows.map((row) => row.sessionId),
              ),
              ...(query.gameId ? [Query.equal('gameId', query.gameId)] : []),
              Query.limit(limit),
              Query.offset(offset),
            ],
          })
        ).rows;
      }
    } else {
      rows = (
        await this.appwrite.tablesDB.listRows<GameplaySessions>({
          databaseId: GameplaySessionQueriesService.DB_ID,
          tableId: GameplaySessionQueriesService.SESSIONS_TABLE,
          queries: [
            Query.equal('privacy', 'public'),
            Query.equal('status', ['scheduled', 'active']),
            ...(query.gameId ? [Query.equal('gameId', query.gameId)] : []),
            Query.limit(limit),
            Query.offset(offset),
          ],
        })
      ).rows;
    }

    return {
      total: rows.length,
      rows: await Promise.all(
        rows.map((session) => this.enrichSummary(session, profile.$id)),
      ),
    };
  }

  async getSessionById(userId: string, sessionId: string) {
    const profile = await this.getProfileByUserId(userId);
    const session = await this.getSession(sessionId);
    const participants =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionQueriesService.DB_ID,
        tableId: GameplaySessionQueriesService.PARTICIPANTS_TABLE,
        queries: [Query.equal('sessionId', sessionId), Query.limit(100)],
      });
    const current = participants.rows.find(
      (row) => row.profileId === profile.$id,
    );

    if (
      session.privacy === 'closed' &&
      session.hostProfileId !== profile.$id &&
      (!current ||
        !['pending', 'invited', 'confirmed'].includes(current.status))
    ) {
      throw new ForbiddenException('Você não tem acesso a esta Jogatina');
    }

    const [host, enrichedParticipants] = await Promise.all([
      this.getProfileById(session.hostProfileId),
      Promise.all(
        participants.rows.map(async (participant) => ({
          ...participant,
          profile: this.publicProfile(
            await this.getProfileById(participant.profileId),
          ),
        })),
      ),
    ]);

    return {
      ...session,
      host: this.publicProfile(host),
      myParticipantStatus: current?.status,
      participants: enrichedParticipants,
    };
  }

  /** Conteúdo seguro para a rota pública e para SSR de links compartilhados. */
  async getPublicSessionById(userId: string | undefined, sessionId: string) {
    const session = await this.getSession(sessionId);
    if (session.privacy !== 'public') {
      throw new NotFoundException('Jogatina não encontrada');
    }

    const participants =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionQueriesService.DB_ID,
        tableId: GameplaySessionQueriesService.PARTICIPANTS_TABLE,
        queries: [
          Query.equal('sessionId', sessionId),
          Query.equal('status', 'confirmed'),
          Query.limit(100),
        ],
      });
    const profile = userId ? await this.getProfileByUserId(userId) : null;
    const current = profile
      ? await this.findParticipant(sessionId, profile.$id)
      : undefined;
    const [host, enrichedParticipants] = await Promise.all([
      this.getProfileById(session.hostProfileId),
      Promise.all(
        participants.rows.map(async (participant) => ({
          ...participant,
          profile: this.publicProfile(
            await this.getProfileById(participant.profileId),
          ),
        })),
      ),
    ]);

    return {
      ...session,
      host: this.publicProfile(host),
      myParticipantStatus: current?.status,
      participants: enrichedParticipants,
    };
  }

  private async enrichSummary(session: GameplaySessions, profileId: string) {
    const [host, current] = await Promise.all([
      this.getProfileById(session.hostProfileId),
      this.findParticipant(session.$id, profileId),
    ]);
    return {
      ...session,
      host: this.publicProfile(host),
      myParticipantStatus: current?.status,
    };
  }

  private publicProfile(profile: UserProfiles | null) {
    return profile
      ? {
          $id: profile.$id,
          gamertag: profile.gamertag,
          avatarUrl: profile.avatarUrl,
        }
      : null;
  }

  private async getProfileByUserId(userId: string): Promise<UserProfiles> {
    const result = await this.appwrite.tablesDB.listRows<UserProfiles>({
      databaseId: 'app',
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    if (!result.rows.length)
      throw new NotFoundException('Perfil do usuário não encontrado');
    return result.rows[0];
  }

  private async getProfileById(
    profileId: string,
  ): Promise<UserProfiles | null> {
    try {
      return await this.appwrite.tablesDB.getRow<UserProfiles>({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: profileId,
      });
    } catch {
      return null;
    }
  }

  private async getSession(sessionId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<GameplaySessions>({
        databaseId: 'app',
        tableId: 'gameplay_sessions',
        rowId: sessionId,
      });
    } catch {
      throw new NotFoundException('Jogatina não encontrada');
    }
  }

  private async findParticipant(sessionId: string, profileId: string) {
    const result =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: 'app',
        tableId: 'gameplay_session_participants',
        queries: [
          Query.equal('sessionId', sessionId),
          Query.equal('profileId', profileId),
          Query.limit(1),
        ],
      });
    return result.rows[0] ?? null;
  }
}
