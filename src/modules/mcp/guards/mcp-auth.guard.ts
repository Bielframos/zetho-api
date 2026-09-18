import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const headerKey = request.headers['x-api-key'];
    const authHeader = request.headers['authorization'];
    const bearerKey =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const queryKey = request.query?.apiKey || request.query?.token;

    const providedKey = (headerKey || bearerKey || queryKey) as
      | string
      | undefined;

    const expected = process.env.MCP_API_KEY || process.env.SYSTEM_API_KEY;

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'MCP_API_KEY ou SYSTEM_API_KEY não está configurada em produção.',
        );
      }
      this.logger.warn(
        'Nenhuma chave MCP_API_KEY ou SYSTEM_API_KEY configurada. Permitindo acesso sem autenticação em ambiente de desenvolvimento.',
      );
      return true;
    }

    if (typeof providedKey !== 'string' || providedKey !== expected) {
      throw new UnauthorizedException(
        'Chave de API inválida para o servidor MCP.',
      );
    }

    return true;
  }
}
