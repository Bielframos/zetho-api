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
    const req = context.switchToHttp().getRequest();

    const secretHeader = req.headers['x-secret'];

    if (secretHeader !== process.env.IGDB_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Segredo do webhook inválido');
    }

    return true;
  }
}
