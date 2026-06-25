import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Account, Client, Models } from 'node-appwrite';
import { ENDPOINT, PROJECT_ID } from 'src/common/appwrite/constants';

@Injectable()
export class OptionalAppwriteSessionGuard implements CanActivate {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      request.user = null;
      return true;
    }

    try {
      const cacheKey = `session:${token}`;
      let user =
        await this.cache.get<Models.User<Models.Preferences>>(cacheKey);

      if (!user) {
        const client = new Client()
          .setEndpoint(ENDPOINT)
          .setProject(PROJECT_ID)
          .setJWT(token);

        user = await new Account(client).get();
        await this.cache.set(cacheKey, user);
      }

      request.user = user;
    } catch {
      request.user = null;
    }

    return true;
  }
}
