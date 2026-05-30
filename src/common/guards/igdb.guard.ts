import crypto from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class IGDBGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();

    const secretHeader = req.headers['x-secret'];

    const provided = Buffer.from(String(secretHeader ?? ''), 'utf8');
    const expected = Buffer.from(process.env.IGDB_WEBHOOK_SECRET ?? '', 'utf8');

    const isValid =
      provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected);

    if (!isValid) {
      throw new UnauthorizedException('Segredo do webhook inválido');
    }

    return true;
  }
}
