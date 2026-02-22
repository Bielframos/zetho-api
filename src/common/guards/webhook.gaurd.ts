import crypto from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AppwriteWebhookGuard implements CanActivate {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const signatureHeader = req.headers['x-appwrite-webhook-signature'];
    const payload = req.rawBody;

    if (!signatureHeader) {
      throw new UnauthorizedException('Assinatura ausente no cabeçalho');
    }

    if (!payload) {
      throw new UnauthorizedException(
        'Raw body não encontrado. Verifique se o webhook enviou dados.',
      );
    }

    const baseUrl = process.env.APP_URL?.replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/webhook/${this.endpoint}`;

    const signatureKey = process.env.APPWRITE_WEBHOOK_SIGNATURE as string;
    const message = webhookUrl + payload.toString();

    const generatedSignature = crypto
      .createHmac('sha1', signatureKey)
      .update(message)
      .digest('base64');

    if (signatureHeader !== generatedSignature)
      throw new UnauthorizedException('Assinatura do Webook inválida');

    return true;
  }
}
