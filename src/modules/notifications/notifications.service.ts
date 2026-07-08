import { Injectable, Logger } from '@nestjs/common';
import { AppwriteException, Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { EmailTemplateService } from './email-template.service';
import { EvolutionService } from './evolution.service';
import { ZETHO_WPP_CHANNEL } from './notifications.constants';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly evolutionService: EvolutionService,
    private readonly appwrite: Appwrite,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async sharePost({
    title,
    subtitle,
    mediaUrl,
    postUrl,
  }: {
    title: string;
    subtitle: string;
    postUrl: string;
    mediaUrl?: string;
  }) {
    const safeSubtitle = subtitle?.trim() || '';
    const caption = `*${title}*\n\n${safeSubtitle}\n\n${postUrl}`;

    try {
      this.logger.log(`Sharing post to WhatsApp channel: ${postUrl}`);

      if (mediaUrl) {
        await this.evolutionService.sendMediaMessage({
          to: ZETHO_WPP_CHANNEL,
          mediaUrl,
          message: caption,
          type: 'image',
        });
      } else {
        await this.evolutionService.sendTextMessage({
          to: ZETHO_WPP_CHANNEL,
          message: caption,
        });
      }

      this.logger.log(`Post shared successfully to WhatsApp: ${postUrl}`);
    } catch (error) {
      this.logger.error(
        `Failed to share post to WhatsApp: ${postUrl}`,
        error as Error,
      );
    }
  }

  async sendGameSubscriberEmails(payload: {
    postId: string;
    title: string;
    subtitle: string;
    slug: string;
    relatedGameIds: string[];
  }) {
    const errors: any[] = [];

    for (const gameId of payload.relatedGameIds) {
      const topicId = `game_${gameId}`;
      const messageId = `${payload.postId}_${gameId}`; // Idempotency by post + game

      try {
        // Get game name for email subject
        const game = await this.appwrite.tablesDB.getRow<
          Models.Row & { name: string }
        >({
          databaseId: 'app',
          tableId: 'games',
          rowId: gameId,
        });

        const emailSubject = `[Zetho] Novidade sobre ${game.name}!`;
        const emailContent = this.emailTemplateService.renderGazethoPostEmail({
          gameName: game.name,
          title: payload.title,
          subtitle: payload.subtitle,
          postUrl: this.getGazethoPostUrl(payload.slug),
        });

        // Send email to the game topic
        await this.appwrite.messaging.createEmail(
          messageId,
          emailSubject,
          emailContent,
          [topicId], // topics
          [],
          [],
          [],
          [],
          [],
          false,
          true,
        );
      } catch (error: unknown) {
        // Ignore duplicate ID conflicts (already sent)
        if (error instanceof AppwriteException && error.code === 409) {
          continue;
        }
        this.logger.error(`Failed to notify for topic ${topicId}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push({ gameId, error: errorMessage });
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to send some subscriber emails: ${JSON.stringify(errors)}`,
      );
    }
  }

  private getGazethoPostUrl(slug: string) {
    return new URL(`/posts/${slug}`, 'https://ga.zetho.app').toString();
  }
}
