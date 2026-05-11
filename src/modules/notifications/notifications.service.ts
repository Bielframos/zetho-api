import { Injectable, Logger } from '@nestjs/common';
import { EvolutionService } from './evolution.service';
import { ZETHO_WPP_CHANNEL } from './notifications.constants';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly evolutionService: EvolutionService,
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
}
