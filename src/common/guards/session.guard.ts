import {
  ForbiddenException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Reflector } from '@nestjs/core';
import { ENDPOINT, PROJECT_ID } from 'infra/appwrite/constants';
import { Account, Client, Models } from 'node-appwrite';
import { Roles } from './roles.decorator';
import { Appwrite } from '../appwrite/appwrite.provider';

@Injectable()
export class AppwriteSessionGuard implements CanActivate {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private appwrite: Appwrite,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (
      process.env.NODE_ENV === 'development' &&
      request.headers['x-debug-user']
    ) {
      const debugUserId = request.headers['x-debug-user'] as string;
      const user = await this.appwrite.users.get(debugUserId);
      request.user = user;
      return true;
    }

    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token de autorização não fornecido');
    }

    const cacheKey = `session:${token}`;

    try {
      let user =
        await this.cache.get<Models.User<Models.Preferences>>(cacheKey);

      if (!user) {
        const client = new Client()
          .setEndpoint(ENDPOINT)
          .setProject(PROJECT_ID)
          .setJWT(token);

        const account = new Account(client);
        user = await account.get();

        await this.cache.set(cacheKey, user);
      }

      const requiredRoles = this.reflector.getAllAndOverride<string[]>(Roles, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (requiredRoles?.length) {
        const userLabels = Array.isArray(user?.labels) ? user.labels : [];
        const hasRequiredRoles = requiredRoles.every((role) =>
          userLabels.includes(role),
        );

        if (!hasRequiredRoles) {
          throw new ForbiddenException(
            'Usuário sem as roles necessárias para acessar este recurso',
          );
        }
      }

      request.user = user;

      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      console.log(error);
      throw new UnauthorizedException(
        'Sessão do Appwrite inválida ou expirada',
      );
    }
  }
}
