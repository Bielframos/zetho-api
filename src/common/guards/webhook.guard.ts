import crypto from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AppwriteWebhookGuard implements CanActivate {
  private endpoint: string;
  private readonly logger = new Logger(AppwriteWebhookGuard.name);

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      rawBody?: Buffer;
    }>();

    const signatureHeader = req.headers['x-appwrite-webhook-signature'];
    const payload = req.rawBody;

    if (!signatureHeader) {
      this.logger.warn(
        `Webhook rejeitado (${this.endpoint}): assinatura ausente no cabeçalho`,
      );
      throw new UnauthorizedException('Assinatura ausente no cabeçalho');
    }

    if (!payload) {
      this.logger.warn(
        `Webhook rejeitado (${this.endpoint}): raw body não encontrado`,
      );
      throw new UnauthorizedException(
        'Raw body não encontrado. Verifique se o webhook enviou dados.',
      );
    }

    const baseUrl = process.env.APP_URL?.replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/webhook/${this.endpoint}`;

    const envSuffix = this.endpoint.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const scopedEnvKey = `APPWRITE_WEBHOOK_SIGNATURE_${envSuffix}`;
    const usedEnvKey = process.env[scopedEnvKey]
      ? scopedEnvKey
      : 'APPWRITE_WEBHOOK_SIGNATURE';
    const signatureKey =
      process.env[scopedEnvKey] || process.env.APPWRITE_WEBHOOK_SIGNATURE;

    if (!signatureKey) {
      this.logger.warn(
        `Webhook rejeitado (${this.endpoint}): nenhuma chave de assinatura configurada ` +
          `(esperado ${scopedEnvKey} ou APPWRITE_WEBHOOK_SIGNATURE)`,
      );
      throw new UnauthorizedException(
        'Configuração de assinatura do webhook ausente',
      );
    }

    const message = webhookUrl + payload.toString();

    const generatedSignature = crypto
      .createHmac('sha1', signatureKey)
      .update(message)
      .digest('base64');

    const signatureBuffer = Buffer.from(String(signatureHeader), 'utf8');
    const generatedBuffer = Buffer.from(generatedSignature, 'utf8');

    const isValid =
      signatureBuffer.length === generatedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, generatedBuffer);

    if (!isValid) {
      this.logger.warn(
        `Webhook rejeitado (${this.endpoint}): assinatura inválida. ` +
          `URL usada na verificação: ${webhookUrl} | chave: ${usedEnvKey}. ` +
          `Confira se a URL cadastrada no Appwrite é exatamente essa e se ${usedEnvKey} ` +
          `corresponde à Signature Key deste webhook.`,
      );
      throw new UnauthorizedException('Assinatura do Webook inválida');
    }

    return true;
  }
}
