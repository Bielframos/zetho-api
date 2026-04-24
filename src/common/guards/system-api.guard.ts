import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SystemApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headerValue = request.headers['x-api-key'];
    const expected = process.env.SYSTEM_API_KEY;

    if (!expected) {
      throw new InternalServerErrorException(
        'SYSTEM_API_KEY não está configurada.',
      );
    }

    if (typeof headerValue !== 'string' || headerValue !== expected) {
      throw new UnauthorizedException('Chave de API inválida.');
    }

    return true;
  }
}
