import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AppwriteWebhookGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const signatureHeader = req.headers['x-appwrite-webhook-signature'];

    if (!signatureHeader) {
      return false;
    }

    if (signatureHeader !== process.env.APPWRITE_WEBHOOK_SIGNATURE)
      throw new UnauthorizedException('Assinatura do Webook inválida');

    return true;
  }
}
