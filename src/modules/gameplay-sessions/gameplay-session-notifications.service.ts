import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type {
  GameplaySessionParticipants,
  Notifications,
  UserProfiles,
} from 'src/infra/appwrite/appwrite.d';

export type SessionNotificationInput = {
  recipientProfileId: string;
  senderProfileId: string;
  type: Notifications['type'];
  title: string;
  body: string;
  entityId: string;
};

@Injectable()
export class GameplaySessionNotificationsService {
  private static readonly DB_ID = 'app';
  private static readonly NOTIFICATIONS_TABLE = 'notifications';
  private static readonly PARTICIPANTS_TABLE = 'gameplay_session_participants';

  constructor(private readonly appwrite: Appwrite) {}

  async getForUser(userId: string) {
    const profile = await this.getProfileByUserId(userId);
    const result = await this.appwrite.tablesDB.listRows<Notifications>({
      databaseId: GameplaySessionNotificationsService.DB_ID,
      tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
      queries: [
        Query.equal('recipientProfileId', profile.$id),
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ],
    });

    return {
      ...result,
      rows: await Promise.all(
        result.rows.map(async (notification) => {
          const [sender, targetUrl] = await Promise.all([
            this.getProfileById(notification.senderProfileId),
            this.getGameCommentTargetUrl(notification),
          ]);
          const relatedProfileId =
            notification.type === 'session_invite'
              ? profile.$id
              : notification.senderProfileId;
          const participant =
            notification.entityId &&
            notification.type !== 'entry_comment' &&
            notification.type !== 'game_comment'
              ? await this.findParticipant(
                  notification.entityId,
                  relatedProfileId,
                )
              : null;
          return {
            ...notification,
            senderProfile: this.publicProfile(sender),
            participantId: participant?.$id,
            actionStatus: participant?.status,
            targetUrl,
          };
        }),
      ),
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const profile = await this.getProfileByUserId(userId);
    let notification: Notifications;
    try {
      notification = await this.appwrite.tablesDB.getRow<Notifications>({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
        rowId: notificationId,
      });
    } catch {
      throw new NotFoundException('Notificação não encontrada');
    }
    if (notification.recipientProfileId !== profile.$id) {
      throw new ForbiddenException('Acesso negado');
    }
    return await this.appwrite.tablesDB.updateRow<Notifications>({
      databaseId: GameplaySessionNotificationsService.DB_ID,
      tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
      rowId: notificationId,
      data: { read: true },
    });
  }

  async deleteOwned(userId: string, notificationId: string) {
    const profile = await this.getProfileByUserId(userId);
    const notification = await this.getNotification(notificationId);
    if (notification.recipientProfileId !== profile.$id) {
      throw new ForbiddenException('Acesso negado');
    }
    await this.appwrite.tablesDB.deleteRow({
      databaseId: GameplaySessionNotificationsService.DB_ID,
      tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
      rowId: notificationId,
    });
  }

  async create(data: SessionNotificationInput) {
    return await this.appwrite.tablesDB.createRow<Notifications>({
      databaseId: GameplaySessionNotificationsService.DB_ID,
      tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
      rowId: ID.unique(),
      data: { ...data, read: false },
    });
  }

  private async getNotification(notificationId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<Notifications>({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: GameplaySessionNotificationsService.NOTIFICATIONS_TABLE,
        rowId: notificationId,
      });
    } catch {
      throw new NotFoundException('Notificação não encontrada');
    }
  }

  private async getGameCommentTargetUrl(notification: Notifications) {
    if (notification.type !== 'game_comment' || !notification.entityId) {
      return undefined;
    }
    try {
      const comment = await this.appwrite.tablesDB.getRow<
        Models.Row & { gameId?: string; slug?: string; parentId?: string }
      >({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: 'game_comments',
        rowId: notification.entityId,
      });
      const rootComment = await this.resolveRootComment(comment);
      const forumSlug = rootComment?.slug?.trim();
      if (forumSlug) {
        return `/forum/${encodeURIComponent(forumSlug)}?commentId=${encodeURIComponent(notification.entityId)}`;
      }
      if (!comment.gameId) return undefined;
      const game = await this.appwrite.tablesDB.getRow<
        Models.Row & { slug?: string }
      >({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: 'games',
        rowId: comment.gameId,
      });
      if (!game.slug) return undefined;
      return `/jogo/${game.slug}?commentId=${encodeURIComponent(notification.entityId)}`;
    } catch {
      return undefined;
    }
  }

  private async resolveRootComment(
    comment: Models.Row & { slug?: string; parentId?: string },
  ) {
    let current: any = comment;
    const visited = new Set<string>(current?.$id ? [current.$id] : []);
    for (let hop = 0; hop < 5; hop += 1) {
      const parentId =
        typeof current?.parentId === 'string'
          ? current.parentId
          : current?.parentId?.$id;
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      const next = await this.appwrite.tablesDB
        .getRow<any>({
          databaseId: GameplaySessionNotificationsService.DB_ID,
          tableId: 'game_comments',
          rowId: parentId,
        })
        .catch(() => null);
      if (!next) break;
      current = next;
    }
    return current;
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
      databaseId: GameplaySessionNotificationsService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });
    if (!result.rows.length) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }
    return result.rows[0];
  }

  private async getProfileById(
    profileId: string,
  ): Promise<UserProfiles | null> {
    try {
      return await this.appwrite.tablesDB.getRow<UserProfiles>({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: 'user_profiles',
        rowId: profileId,
      });
    } catch {
      return null;
    }
  }

  private async findParticipant(sessionId: string, profileId: string) {
    const result =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionNotificationsService.DB_ID,
        tableId: GameplaySessionNotificationsService.PARTICIPANTS_TABLE,
        queries: [
          Query.equal('sessionId', sessionId),
          Query.equal('profileId', profileId),
          Query.limit(1),
        ],
      });
    return result.rows[0] ?? null;
  }
}
