import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor() {}

  private async api({
    method,
    path,
    body,
  }: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: any;
  }) {
    const baseUrl = process.env.EVOLUTION_API_URL;
    const token = process.env.EVOLUTION_API_TOKEN;

    if (!baseUrl || !token) {
      throw new Error('Evolution API URL and token must be set');
    }

    const url = new URL(path, baseUrl).toString();
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: token,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const rawResponse = await res.text();
      let data: unknown = null;

      if (rawResponse) {
        try {
          data = JSON.parse(rawResponse);
        } catch {
          data = rawResponse;
        }
      }

      if (!res.ok) {
        this.logger.error(
          `Evolution API request failed: ${method} ${path} (${res.status} ${res.statusText})`,
        );
        const errorDetails =
          typeof data === 'string' && data.trim().length > 0
            ? ` - ${data.slice(0, 300)}`
            : '';
        throw new Error(
          `Evolution API request failed (${res.status} ${res.statusText})${errorDetails}`,
        );
      }

      return data;
    } catch (error) {
      this.logger.error(
        `Unexpected error communicating with Evolution API: ${method} ${path}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Sends a text message to a specified recipient.
   * @param param0 An object containing the recipient's number and the message text.
   */
  async sendTextMessage({ to, message }: { to: string; message: string }) {
    await this.api({
      method: 'POST',
      path: '/send/text',
      body: {
        number: to,
        text: message,
      },
    });
  }

  /**
   * Sends a media message to a specified recipient.
   * @param param0 An object containing the recipient's number, media URL, message text, and media type.
   */
  async sendMediaMessage({
    to,
    mediaUrl,
    message,
    type,
  }: {
    to: string;
    mediaUrl: string;
    message: string;
    type: 'image' | 'video' | 'audio' | 'document';
  }) {
    await this.api({
      method: 'POST',
      path: '/send/media',
      body: {
        number: to,
        mediaUrl,
        caption: message,
        type,
      },
    });
  }
}
