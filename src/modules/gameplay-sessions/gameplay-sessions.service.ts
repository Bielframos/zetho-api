import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppwriteException, ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { OutboxService } from 'src/infra/events/outbox.service';
import type {
  GameplaySessionParticipants,
  GameplaySessions,
  Notifications,
  UserProfiles,
} from 'src/infra/appwrite/appwrite.d';
import type { GameplaySessionParticipantStatus } from 'src/infra/appwrite/appwrite-custom.types';
import { EmailTemplateService } from '../notifications/email-template.service';
import { CreateGameplaySessionDto } from './dto/create-gameplay-session.dto';
import { InviteGameplaySessionDto } from './dto/invite-gameplay-session.dto';
import { QueryGameplaySessionDto } from './dto/query-gameplay-session.dto';

type ParticipantAction = 'approve' | 'reject' | 'remove' | 'cancel_invite';
type ParticipantTransitionResult = {
  participant: GameplaySessionParticipants;
  changed: boolean;
};

@Injectable()
export class GameplaySessionsService {
  private readonly logger = new Logger(GameplaySessionsService.name);
  private static readonly DB_ID = 'app';
  private static readonly SESSIONS_TABLE = 'gameplay_sessions';
  private static readonly PARTICIPANTS_TABLE = 'gameplay_session_participants';
  private static readonly NOTIFICATIONS_TABLE = 'notifications';

  constructor(
    private readonly appwrite: Appwrite,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly outbox: OutboxService,
    private readonly transactions: TransactionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredSessions() {
    const now = new Date().toISOString();
    try {
      const response = await this.appwrite.tablesDB.listRows<GameplaySessions>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.SESSIONS_TABLE,
        queries: [
          Query.equal('status', 'scheduled'),
          Query.lessThan('scheduledAt', now),
          Query.limit(50),
        ],
      });

      for (const session of response.rows) {
        await this.appwrite.tablesDB.updateRow<GameplaySessions>({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.SESSIONS_TABLE,
          rowId: session.$id,
          data: { status: 'completed' },
        });
        await this.outbox.enqueueImmediate({
          type: 'GAMEPLAY_SESSION_COMPLETED',
          payload: {
            sessionId: session.$id,
            hostProfileId: session.hostProfileId,
            gameId: session.gameId,
          },
        });
      }
    } catch (error) {
      this.logger.error('Falha ao concluir Jogatinas expiradas', error);
    }
  }

  async createSession(userId: string, dto: CreateGameplaySessionDto) {
    const host = await this.getProfileByUserId(userId);
    this.assertScheduledAtInFuture(dto.scheduledAt);
    const now = new Date().toISOString();
    const sessionId = ID.unique();
    const game = await this.resolveGame(dto);

    const session = await this.transactions.runInTransaction(
      async ({ txId }) => {
        const created =
          await this.appwrite.tablesDB.createRow<GameplaySessions>({
            databaseId: GameplaySessionsService.DB_ID,
            tableId: GameplaySessionsService.SESSIONS_TABLE,
            rowId: sessionId,
            data: {
              hostProfileId: host.$id,
              gameId: dto.gameId,
              gameName: game.name,
              gameCoverUrl: game.coverUrl,
              title: dto.title.trim(),
              description: dto.description?.trim() || null,
              scheduledAt: dto.scheduledAt,
              privacy: dto.privacy,
              maxPlayers: dto.maxPlayers,
              confirmedCount: 1,
              status: 'scheduled',
              tags: dto.tags ?? null,
            },
            transactionId: txId,
          });

        await this.appwrite.tablesDB.createRow<GameplaySessionParticipants>({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
          rowId: ID.unique(),
          data: {
            sessionId,
            profileId: host.$id,
            status: 'confirmed',
            isHost: true,
            invitedAt: now,
            respondedAt: now,
          },
          transactionId: txId,
        });
        return created;
      },
    );

    if (new Date(dto.scheduledAt) > new Date()) {
      await this.sendEmailToProfile(
        host,
        `[Zetho] Lembrete da Jogatina: ${dto.title}`,
        this.emailTemplateService.renderSessionStartReminderEmail({
          recipientName: host.gamertag,
          sessionTitle: dto.title,
          gameName: game.name,
          scheduledAt: dto.scheduledAt,
        }),
        dto.scheduledAt,
      );
    }

    if (dto.privacy === 'closed' && dto.invitedProfileIds?.length) {
      await this.inviteProfileIds(host, session, dto.invitedProfileIds, now);
    }

    return session;
  }

  async listSessions(userId: string, query: QueryGameplaySessionDto) {
    const profile = await this.getProfileByUserId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    let rows: GameplaySessions[] = [];

    if (query.type === 'my_sessions') {
      const [relations, hosted] = await Promise.all([
        this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
          queries: [
            Query.equal('profileId', profile.$id),
            Query.equal('status', 'confirmed'),
            Query.limit(100),
          ],
        }),
        this.appwrite.tablesDB.listRows<GameplaySessions>({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.SESSIONS_TABLE,
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
            databaseId: GameplaySessionsService.DB_ID,
            tableId: GameplaySessionsService.SESSIONS_TABLE,
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
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
          queries: [
            Query.equal('profileId', profile.$id),
            Query.equal('status', 'invited'),
            Query.limit(100),
          ],
        });
      if (invites.rows.length) {
        rows = (
          await this.appwrite.tablesDB.listRows<GameplaySessions>({
            databaseId: GameplaySessionsService.DB_ID,
            tableId: GameplaySessionsService.SESSIONS_TABLE,
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
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.SESSIONS_TABLE,
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
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
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

  async requestToJoin(userId: string, sessionId: string) {
    const profile = await this.getProfileByUserId(userId);
    let session: GameplaySessions | undefined;
    try {
      const result =
        await this.transactions.runInTransaction<ParticipantTransitionResult>(
          async ({ txId }) => {
            session = await this.getSession(sessionId, txId);
            this.assertMutable(session);
            if (session.privacy !== 'public') {
              throw new ForbiddenException(
                'Esta Jogatina aceita somente pessoas convidadas',
              );
            }
            if (session.hostProfileId === profile.$id) {
              throw new BadRequestException(
                'O host já participa desta Jogatina',
              );
            }

            const existing = await this.findParticipant(
              sessionId,
              profile.$id,
              txId,
            );
            if (existing?.status === 'pending') {
              return { participant: existing, changed: false };
            }
            if (
              existing &&
              ['rejected', 'removed', 'cancelled'].includes(existing.status)
            ) {
              throw new ForbiddenException(
                'Não é possível solicitar entrada novamente nesta Jogatina',
              );
            }
            if (existing?.status === 'confirmed') {
              throw new ConflictException('Você já participa desta Jogatina');
            }
            const now = new Date().toISOString();
            if (existing) {
              return {
                participant: await this.updateParticipantRow(
                  existing.$id,
                  'pending',
                  now,
                  txId,
                ),
                changed: true,
              };
            }
            return {
              participant:
                await this.appwrite.tablesDB.createRow<GameplaySessionParticipants>(
                  {
                    databaseId: GameplaySessionsService.DB_ID,
                    tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
                    rowId: ID.unique(),
                    data: {
                      sessionId,
                      profileId: profile.$id,
                      status: 'pending',
                      isHost: false,
                      invitedAt: now,
                      respondedAt: null,
                    },
                    transactionId: txId,
                  },
                ),
              changed: true,
            };
          },
        );

      if (result.changed) {
        await this.createNotification({
          recipientProfileId: session!.hostProfileId,
          senderProfileId: profile.$id,
          type: 'session_rsvp',
          title: 'Nova solicitação para a Jogatina',
          body: `${profile.gamertag} solicitou entrada na Jogatina "${session!.title}".`,
          entityId: sessionId,
        });
        await this.emitTransition('GAMEPLAY_SESSION_JOIN_REQUESTED', {
          sessionId,
          participantId: result.participant.$id,
        });
      }
      return result.participant;
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 409) {
        const participant = await this.findParticipant(sessionId, profile.$id);
        if (participant?.status === 'pending') return participant;
      }
      throw error;
    }
  }

  async respondToInvitation(
    userId: string,
    sessionId: string,
    action: 'accept' | 'decline',
  ) {
    const profile = await this.getProfileByUserId(userId);
    let session: GameplaySessions | undefined;
    const targetStatus = action === 'accept' ? 'confirmed' : 'declined';
    const result =
      await this.transactions.runInTransaction<ParticipantTransitionResult>(
        async ({ txId }) => {
          session = await this.getSession(sessionId, txId);
          this.assertMutable(session);
          const existing = await this.findParticipant(
            sessionId,
            profile.$id,
            txId,
          );
          if (!existing) {
            throw new ForbiddenException('Convite não encontrado');
          }
          if (existing.status === targetStatus) {
            return { participant: existing, changed: false };
          }
          if (existing.status !== 'invited') {
            throw new ConflictException('Este convite não está mais pendente');
          }
          if (targetStatus === 'confirmed') {
            await this.assertCapacity(session, txId);
          }
          const updated = await this.updateParticipantRow(
            existing.$id,
            targetStatus,
            new Date().toISOString(),
            txId,
          );
          await this.syncConfirmedCount(sessionId, txId);
          return { participant: updated, changed: true };
        },
      );

    if (result.changed) {
      await this.createNotification({
        recipientProfileId: session!.hostProfileId,
        senderProfileId: profile.$id,
        type: 'session_rsvp',
        title: 'Resposta ao convite da Jogatina',
        body: `${profile.gamertag} ${
          action === 'accept' ? 'aceitou' : 'recusou'
        } o convite para "${session!.title}".`,
        entityId: sessionId,
      });
      await this.emitTransition('GAMEPLAY_SESSION_INVITATION_RESPONDED', {
        sessionId,
        participantId: result.participant.$id,
        status: targetStatus,
      });
      const host = await this.getProfileById(session!.hostProfileId);
      if (host) {
        await this.sendEmailToProfile(
          host,
          `[Zetho] Resposta à Jogatina: ${session!.title}`,
          this.emailTemplateService.renderSessionRsvpEmail({
            hostName: host.gamertag,
            participantName: profile.gamertag,
            sessionTitle: session!.title,
            status: targetStatus,
          }),
        );
      }
      if (targetStatus === 'confirmed') {
        await this.scheduleReminder(profile, session!);
      }
    }
    return result.participant;
  }

  async leave(userId: string, sessionId: string) {
    const profile = await this.getProfileByUserId(userId);
    let session: GameplaySessions | undefined;
    const result =
      await this.transactions.runInTransaction<ParticipantTransitionResult>(
        async ({ txId }) => {
          session = await this.getSession(sessionId, txId);
          this.assertMutable(session);
          if (session.hostProfileId === profile.$id) {
            throw new ForbiddenException(
              'O host deve cancelar a Jogatina em vez de sair',
            );
          }
          const existing = await this.findParticipant(
            sessionId,
            profile.$id,
            txId,
          );
          if (!existing)
            throw new NotFoundException('Participação não encontrada');
          if (existing.status === 'left') {
            return { participant: existing, changed: false };
          }
          if (existing.status !== 'confirmed') {
            throw new ConflictException(
              'Somente participantes confirmados podem sair',
            );
          }
          const updated = await this.updateParticipantRow(
            existing.$id,
            'left',
            new Date().toISOString(),
            txId,
          );
          await this.syncConfirmedCount(sessionId, txId);
          return { participant: updated, changed: true };
        },
      );

    if (result.changed) {
      await this.createNotification({
        recipientProfileId: session!.hostProfileId,
        senderProfileId: profile.$id,
        type: 'session_rsvp',
        title: 'Participante saiu da Jogatina',
        body: `${profile.gamertag} saiu da Jogatina "${session!.title}".`,
        entityId: sessionId,
      });
      await this.emitTransition('GAMEPLAY_SESSION_PARTICIPANT_LEFT', {
        sessionId,
        participantId: result.participant.$id,
      });
    }
    return result.participant;
  }

  async updateParticipant(
    userId: string,
    sessionId: string,
    participantId: string,
    action: ParticipantAction,
  ) {
    const host = await this.getProfileByUserId(userId);
    let session: GameplaySessions | undefined;
    let previousStatus: GameplaySessionParticipantStatus | undefined;
    const nextByAction: Record<
      ParticipantAction,
      GameplaySessionParticipantStatus
    > = {
      approve: 'confirmed',
      reject: 'rejected',
      remove: 'removed',
      cancel_invite: 'cancelled',
    };
    const requiredByAction: Record<
      ParticipantAction,
      GameplaySessionParticipantStatus
    > = {
      approve: 'pending',
      reject: 'pending',
      remove: 'confirmed',
      cancel_invite: 'invited',
    };

    const result =
      await this.transactions.runInTransaction<ParticipantTransitionResult>(
        async ({ txId }) => {
          session = await this.getSession(sessionId, txId);
          this.assertMutable(session);
          if (session.hostProfileId !== host.$id) {
            throw new ForbiddenException(
              'Somente o host pode gerenciar participantes',
            );
          }
          const existing = await this.getParticipantById(participantId, txId);
          if (existing.sessionId !== sessionId) {
            throw new NotFoundException('Participante não encontrado');
          }
          if (existing.isHost || existing.profileId === host.$id) {
            throw new ForbiddenException(
              'O host não pode remover a si próprio',
            );
          }
          previousStatus = existing.status as GameplaySessionParticipantStatus;
          const nextStatus = nextByAction[action];
          if (existing.status === nextStatus) {
            return { participant: existing, changed: false };
          }
          if (existing.status !== requiredByAction[action]) {
            throw new ConflictException(
              'Esta ação não é válida para o estado atual do participante',
            );
          }
          if (action === 'approve') await this.assertCapacity(session, txId);
          const updated = await this.updateParticipantRow(
            participantId,
            nextStatus,
            new Date().toISOString(),
            txId,
          );
          if (
            action === 'approve' ||
            action === 'remove' ||
            previousStatus === 'confirmed'
          ) {
            await this.syncConfirmedCount(sessionId, txId);
          }
          return { participant: updated, changed: true };
        },
      );

    const participant = result.participant;
    const copy: Record<ParticipantAction, { title: string; body: string }> = {
      approve: {
        title: 'Entrada aprovada na Jogatina',
        body: `Sua entrada na Jogatina "${session!.title}" foi aprovada.`,
      },
      reject: {
        title: 'Solicitação recusada',
        body: `Sua solicitação para a Jogatina "${session!.title}" foi recusada.`,
      },
      remove: {
        title: 'Removido da Jogatina',
        body: `Você foi removido da Jogatina "${session!.title}".`,
      },
      cancel_invite: {
        title: 'Convite cancelado',
        body: `Seu convite para a Jogatina "${session!.title}" foi cancelado.`,
      },
    };
    if (result.changed) {
      await this.createNotification({
        recipientProfileId: participant.profileId,
        senderProfileId: host.$id,
        type: 'session_rsvp',
        title: copy[action].title,
        body: copy[action].body,
        entityId: sessionId,
      });
      await this.emitTransition('GAMEPLAY_SESSION_PARTICIPANT_UPDATED', {
        sessionId,
        participantId,
        action,
        previousStatus,
        status: participant.status,
      });
      if (action === 'approve') {
        const target = await this.getProfileById(participant.profileId);
        if (target) await this.scheduleReminder(target, session!);
      }
    }
    return participant;
  }

  async inviteParticipants(
    userId: string,
    sessionId: string,
    dto: InviteGameplaySessionDto,
  ) {
    const host = await this.getProfileByUserId(userId);
    const session = await this.getSession(sessionId);
    this.assertMutable(session);
    if (session.hostProfileId !== host.$id) {
      throw new ForbiddenException('Somente o host pode enviar convites');
    }
    const invited = await this.inviteProfileIds(
      host,
      session,
      dto.invitedProfileIds,
      new Date().toISOString(),
    );
    return { invited };
  }

  async cancelSession(userId: string, sessionId: string) {
    const host = await this.getProfileByUserId(userId);
    let activeParticipants: GameplaySessionParticipants[] = [];
    const updated = await this.transactions.runInTransaction(
      async ({ txId }) => {
        const session = await this.getSession(sessionId, txId);
        this.assertMutable(session);
        if (session.hostProfileId !== host.$id) {
          throw new ForbiddenException(
            'Somente o host pode cancelar a Jogatina',
          );
        }
        activeParticipants = (
          await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
            databaseId: GameplaySessionsService.DB_ID,
            tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
            queries: [
              Query.equal('sessionId', sessionId),
              Query.equal('status', ['pending', 'invited', 'confirmed']),
              Query.limit(100),
            ],
            transactionId: txId,
          })
        ).rows.filter((participant) => !participant.isHost);

        const now = new Date().toISOString();
        await Promise.all(
          activeParticipants.map((participant) =>
            this.updateParticipantRow(participant.$id, 'cancelled', now, txId),
          ),
        );
        return await this.appwrite.tablesDB.updateRow<GameplaySessions>({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: GameplaySessionsService.SESSIONS_TABLE,
          rowId: sessionId,
          data: { status: 'cancelled', confirmedCount: 1 },
          transactionId: txId,
        });
      },
    );

    await Promise.all(
      activeParticipants.map(async (participant) => {
        await this.createNotification({
          recipientProfileId: participant.profileId,
          senderProfileId: host.$id,
          type: 'session_reminder',
          title: 'Jogatina cancelada',
          body: `A Jogatina "${updated.title}" foi cancelada pelo host.`,
          entityId: sessionId,
        });
        const target = await this.getProfileById(participant.profileId);
        if (target) {
          await this.sendEmailToProfile(
            target,
            `[Zetho] Jogatina cancelada: ${updated.title}`,
            this.emailTemplateService.renderSessionCancellationEmail({
              recipientName: target.gamertag,
              sessionTitle: updated.title,
              gameName: updated.gameName,
            }),
          );
        }
      }),
    );
    await this.emitTransition('GAMEPLAY_SESSION_CANCELLED', { sessionId });
    return updated;
  }

  async getNotifications(userId: string) {
    const profile = await this.getProfileByUserId(userId);
    const result = await this.appwrite.tablesDB.listRows<Notifications>({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
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
          const notificationType = notification.type as string;
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
            notificationType !== 'entry_comment' &&
            notificationType !== 'game_comment'
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

  async markNotificationAsRead(userId: string, notificationId: string) {
    const profile = await this.getProfileByUserId(userId);
    let notification: Notifications;
    try {
      notification = await this.appwrite.tablesDB.getRow<Notifications>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
        rowId: notificationId,
      });
    } catch {
      throw new NotFoundException('Notificação não encontrada');
    }
    if (notification.recipientProfileId !== profile.$id) {
      throw new ForbiddenException('Acesso negado');
    }
    return await this.appwrite.tablesDB.updateRow<Notifications>({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
      rowId: notificationId,
      data: { read: true },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    const profile = await this.getProfileByUserId(userId);
    const notification = await this.getNotification(notificationId);
    if (notification.recipientProfileId !== profile.$id) {
      throw new ForbiddenException('Acesso negado');
    }
    await this.appwrite.tablesDB.deleteRow({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
      rowId: notificationId,
    });
  }

  private async inviteProfileIds(
    host: UserProfiles,
    session: GameplaySessions,
    profileIds: string[],
    now: string,
  ) {
    const uniqueIds = [...new Set(profileIds)].filter(
      (profileId) => profileId !== host.$id,
    );
    const invited: GameplaySessionParticipants[] = [];
    const targets = await Promise.all(
      uniqueIds.map((profileId) => this.getProfileById(profileId)),
    );
    const missingProfileIndex = targets.findIndex((target) => !target);
    if (missingProfileIndex >= 0) {
      throw new BadRequestException(
        `Perfil convidado não encontrado: ${uniqueIds[missingProfileIndex]}`,
      );
    }

    for (const [index, profileId] of uniqueIds.entries()) {
      const participant = await this.transactions.runInTransaction(
        async ({ txId }) => {
          const currentSession = await this.getSession(session.$id, txId);
          this.assertMutable(currentSession);
          const existing = await this.findParticipant(
            session.$id,
            profileId,
            txId,
          );
          if (
            existing &&
            ['pending', 'invited', 'confirmed'].includes(existing.status)
          ) {
            return null;
          }
          if (existing) {
            return await this.updateParticipantRow(
              existing.$id,
              'invited',
              now,
              txId,
              true,
            );
          }
          return await this.appwrite.tablesDB.createRow<GameplaySessionParticipants>(
            {
              databaseId: GameplaySessionsService.DB_ID,
              tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
              rowId: ID.unique(),
              data: {
                sessionId: session.$id,
                profileId,
                status: 'invited',
                isHost: false,
                invitedAt: now,
                respondedAt: null,
              },
              transactionId: txId,
            },
          );
        },
      );
      if (!participant) continue;
      invited.push(participant);
      await this.createNotification({
        recipientProfileId: profileId,
        senderProfileId: host.$id,
        type: 'session_invite',
        title: 'Convite para uma Jogatina',
        body: `${host.gamertag} convidou você para a Jogatina "${session.title}" (${session.gameName}).`,
        entityId: session.$id,
      });
      const target = targets[index]!;
      if (target) {
        await this.sendEmailToProfile(
          target,
          `[Zetho] Convite para a Jogatina: ${session.title}`,
          this.emailTemplateService.renderSessionInviteEmail({
            recipientName: target.gamertag,
            hostName: host.gamertag,
            sessionTitle: session.title,
            gameName: session.gameName,
            scheduledAt: session.scheduledAt,
          }),
        );
      }
      await this.emitTransition('GAMEPLAY_SESSION_INVITED', {
        sessionId: session.$id,
        participantId: participant.$id,
      });
    }
    return invited;
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

  private async syncConfirmedCount(sessionId: string, txId: string) {
    const confirmed =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
        queries: [
          Query.equal('sessionId', sessionId),
          Query.equal('status', 'confirmed'),
          Query.limit(100),
        ],
        transactionId: txId,
      });
    await this.appwrite.tablesDB.updateRow<GameplaySessions>({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.SESSIONS_TABLE,
      rowId: sessionId,
      data: {
        confirmedCount: confirmed.total,
      },
      transactionId: txId,
    });
    return confirmed.total;
  }

  private async assertCapacity(session: GameplaySessions, txId: string) {
    const confirmed =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
        queries: [
          Query.equal('sessionId', session.$id),
          Query.equal('status', 'confirmed'),
          Query.limit(session.maxPlayers),
        ],
        transactionId: txId,
      });
    if (confirmed.total >= session.maxPlayers) {
      throw new BadRequestException('A Jogatina está lotada');
    }
  }

  private assertMutable(session: GameplaySessions) {
    if (session.status !== 'scheduled') {
      throw new BadRequestException('Esta Jogatina não aceita mais alterações');
    }
    if (new Date(session.scheduledAt).getTime() <= Date.now()) {
      throw new BadRequestException('Esta Jogatina já começou');
    }
  }

  private assertScheduledAtInFuture(scheduledAt: string) {
    const timestamp = new Date(scheduledAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw new BadRequestException(
        'A data de início da Jogatina deve estar no futuro',
      );
    }
  }

  private async getSession(sessionId: string, transactionId?: string) {
    try {
      return await this.appwrite.tablesDB.getRow<GameplaySessions>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.SESSIONS_TABLE,
        rowId: sessionId,
        transactionId,
      });
    } catch {
      throw new NotFoundException('Jogatina não encontrada');
    }
  }

  private async findParticipant(
    sessionId: string,
    profileId: string,
    transactionId?: string,
  ): Promise<GameplaySessionParticipants | null> {
    const result =
      await this.appwrite.tablesDB.listRows<GameplaySessionParticipants>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
        queries: [
          Query.equal('sessionId', sessionId),
          Query.equal('profileId', profileId),
          Query.limit(1),
        ],
        transactionId,
      });
    return result.rows[0] ?? null;
  }

  private async getParticipantById(
    participantId: string,
    transactionId?: string,
  ) {
    try {
      return await this.appwrite.tablesDB.getRow<GameplaySessionParticipants>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
        rowId: participantId,
        transactionId,
      });
    } catch {
      throw new NotFoundException('Participante não encontrado');
    }
  }

  private async updateParticipantRow(
    participantId: string,
    status: GameplaySessionParticipantStatus,
    now: string,
    transactionId: string,
    resetInvitation = false,
  ) {
    return await this.appwrite.tablesDB.updateRow<GameplaySessionParticipants>({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.PARTICIPANTS_TABLE,
      rowId: participantId,
      data: {
        status,
        invitedAt: resetInvitation ? now : undefined,
        respondedAt: status === 'pending' || status === 'invited' ? null : now,
      },
      transactionId,
    });
  }

  private async createNotification(data: {
    recipientProfileId: string;
    senderProfileId: string;
    type: Notifications['type'];
    title: string;
    body: string;
    entityId: string;
  }) {
    return await this.appwrite.tablesDB.createRow<Notifications>({
      databaseId: GameplaySessionsService.DB_ID,
      tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
      rowId: ID.unique(),
      data: { ...data, read: false },
    });
  }

  private async getNotification(notificationId: string) {
    try {
      return await this.appwrite.tablesDB.getRow<Notifications>({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: GameplaySessionsService.NOTIFICATIONS_TABLE,
        rowId: notificationId,
      });
    } catch {
      throw new NotFoundException('Notificação não encontrada');
    }
  }

  private async getGameCommentTargetUrl(notification: Notifications) {
    if ((notification.type as string) !== 'game_comment') return undefined;
    if (!notification.entityId) return undefined;

    try {
      const comment = await this.appwrite.tablesDB.getRow<
        Models.Row & { gameId?: string }
      >({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: 'game_comments',
        rowId: notification.entityId,
      });
      if (!comment.gameId) return undefined;

      const game = await this.appwrite.tablesDB.getRow<
        Models.Row & { slug?: string }
      >({
        databaseId: GameplaySessionsService.DB_ID,
        tableId: 'games',
        rowId: comment.gameId,
      });
      if (!game.slug) return undefined;

      return `/jogo/${game.slug}?commentId=${encodeURIComponent(notification.entityId)}`;
    } catch {
      return undefined;
    }
  }

  private async emitTransition(type: string, payload: object) {
    await this.outbox.enqueueImmediate({ type, payload });
  }

  private async resolveGame(dto: CreateGameplaySessionDto) {
    let name = dto.gameName;
    let coverUrl = dto.gameCoverUrl ?? null;
    if (!name) {
      try {
        const game = await this.appwrite.tablesDB.getRow<
          Models.Row & { name: string; coverUrl?: string }
        >({
          databaseId: GameplaySessionsService.DB_ID,
          tableId: 'games',
          rowId: dto.gameId,
        });
        name = game.name;
        coverUrl ??= game.coverUrl ?? null;
      } catch {
        name = 'Jogo';
      }
    }
    return { name: name || 'Jogo', coverUrl };
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
      databaseId: GameplaySessionsService.DB_ID,
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
        databaseId: GameplaySessionsService.DB_ID,
        tableId: 'user_profiles',
        rowId: profileId,
      });
    } catch {
      return null;
    }
  }

  private async scheduleReminder(
    profile: UserProfiles,
    session: GameplaySessions,
  ) {
    if (new Date(session.scheduledAt) <= new Date()) return;
    await this.sendEmailToProfile(
      profile,
      `[Zetho] Lembrete da Jogatina: ${session.title}`,
      this.emailTemplateService.renderSessionStartReminderEmail({
        recipientName: profile.gamertag,
        sessionTitle: session.title,
        gameName: session.gameName,
        scheduledAt: session.scheduledAt,
      }),
      session.scheduledAt,
    );
  }

  private async sendEmailToProfile(
    target: UserProfiles,
    subject: string,
    htmlContent: string,
    scheduledAt?: string,
  ) {
    if (!target.userId) return;
    try {
      const validScheduledAt =
        scheduledAt && new Date(scheduledAt) > new Date()
          ? scheduledAt
          : undefined;
      await this.appwrite.messaging.createEmail(
        ID.unique(),
        subject,
        htmlContent,
        [],
        [target.userId],
        [],
        [],
        [],
        [],
        false,
        true,
        validScheduledAt,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail da Jogatina para ${target.$id}`,
        error,
      );
    }
  }
}
