import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import { EmailTemplateService } from 'src/modules/notifications/email-template.service';
import { resolveFrontendOrigin } from 'src/common/utils/frontend-origin';

@Injectable()
export class CommentNotificationService {
  private readonly logger = new Logger(CommentNotificationService.name);
  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {
    this.tablesDB = appwrite.tablesDB;
  }

  async handleCommentCreate(comment: any) {
    const parentId = this.extractRelationId(comment.parentId);
    const replyProfileId = this.extractRelationId(comment.userProfile);

    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: 'ZethoHandler',
        operation: 'webhook.comments.on-create',
        metadata: {
          commentId: comment.$id,
          parentId,
          replyProfileId,
        },
      },
      async () => {
        if (!parentId) {
          return {
            success: true,
            message: 'Comentário raiz, sem necessidade de notificação.',
          };
        }

        // 1. Obter comentário pai
        const parentComment = await this.tablesDB.getRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: parentId,
        });

        const parentProfileId = this.extractRelationId(
          parentComment.userProfile,
        );

        if (!parentProfileId) {
          return {
            success: true,
            message: 'Comentário pai sem perfil vinculado.',
          };
        }

        // Ignorar se o usuário estiver respondendo a si mesmo
        if (replyProfileId === parentProfileId) {
          return { success: true, message: 'Auto-resposta ignorada.' };
        }

        // 2. Obter perfis e o jogo do comentário
        const [parentProfile, replyProfile, game] = await Promise.all([
          this.tablesDB.getRow<any>({
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: parentProfileId,
          }),
          replyProfileId
            ? this.tablesDB.getRow<any>({
                databaseId: 'app',
                tableId: 'user_profiles',
                rowId: replyProfileId,
              })
            : Promise.resolve(null),
          comment.gameId
            ? this.tablesDB
                .getRow<any>({
                  databaseId: 'app',
                  tableId: 'games',
                  rowId: comment.gameId,
                })
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        const replyAuthor = replyProfile?.gamertag || 'Alguém';
        const gameName = game?.name || 'um jogo';

        // 3. Criar notificação in-app para o autor do comentário pai.
        // O tipo ainda não consta na declaração gerada, então permanece como
        // string local até a próxima regeneração do schema.
        if (replyProfileId) {
          const notificationType: string = 'game_comment';

          try {
            await this.tablesDB.createRow({
              databaseId: 'app',
              tableId: 'notifications',
              rowId: crypto
                .createHash('sha256')
                .update(`reply:${comment.$id}`)
                .digest('hex')
                .slice(0, 32),
              data: {
                recipientProfileId: parentProfileId,
                senderProfileId: replyProfileId,
                type: notificationType,
                title: `${replyAuthor} respondeu ao seu comentário`,
                body:
                  comment.content ||
                  `Nova resposta ao seu comentário em ${gameName}.`,
                entityId: comment.$id,
                read: false,
              },
            });
          } catch (error) {
            if ((error as any)?.code !== 409) throw error;
          }
        }

        if (!parentProfile.userId) {
          return {
            success: true,
            message: 'Perfil pai não possui userId vinculado.',
          };
        }

        // 4. Enviar e-mail de resposta direto para o autor do comentário pai
        const rootComment = await this.resolveRootComment(parentComment);
        const forumSlug = rootComment?.slug?.trim();
        const gameUrl = forumSlug
          ? new URL(
              `/forum/${encodeURIComponent(forumSlug)}?commentId=${encodeURIComponent(comment.$id)}`,
              this.getFrontendAppUrl(),
            ).toString()
          : game?.slug
            ? new URL(
                `/jogo/${game.slug}?commentId=${encodeURIComponent(comment.$id)}`,
                this.getFrontendAppUrl(),
              ).toString()
            : this.getFrontendAppUrl();
        const emailSubject = game?.name
          ? `[Zetho] Nova resposta ao seu comentário em ${game.name}`
          : `[Zetho] Nova resposta ao seu comentário`;
        const emailContent = this.emailTemplateService.renderCommentReplyEmail({
          recipientName: parentProfile.gamertag || 'Gamer',
          replyAuthor,
          commentContent: comment.content,
          gameName,
          gameUrl,
        });

        try {
          await this.appwrite.messaging.createEmail(
            crypto
              .createHash('sha256')
              .update(`reply-email:${comment.$id}`)
              .digest('hex')
              .slice(0, 32),
            emailSubject,
            emailContent,
            [], // topics
            [parentProfile.userId], // users
            [], // targets
            [], // cc
            [], // bcc
            [], // attachments
            false, // draft
            true, // html
          );
        } catch (error: any) {
          if (error?.code !== 409) throw error;
        }

        return { success: true, message: 'E-mail de resposta enviado.' };
      },
    );
  }

  private extractRelationId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && '$id' in value) {
      const id = (value as { $id?: unknown }).$id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private async resolveRootComment(comment: any) {
    let current = comment;
    const visited = new Set<string>(current?.$id ? [current.$id] : []);
    for (let hop = 0; hop < 5; hop += 1) {
      const parentId = this.extractRelationId(current?.parentId);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      const next = await this.tablesDB
        .getRow<any>({
          databaseId: 'app',
          tableId: 'game_comments',
          rowId: parentId,
        })
        .catch(() => null);
      if (!next) break;
      current = next;
    }
    return current;
  }

  private getFrontendAppUrl() {
    return `${resolveFrontendOrigin()}/`;
  }
}
