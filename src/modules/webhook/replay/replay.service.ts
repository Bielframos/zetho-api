import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

@Injectable()
export class WebhookReplayService {
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async isDuplicate(eventKey: string): Promise<boolean> {
    const key = this.getCacheKey(eventKey);
    const existing = await this.cache.get<string>(key);

    if (existing) {
      return true;
    }

    await this.cache.set(key, '1', WebhookReplayService.CACHE_TTL_MS);
    return false;
  }

  private getCacheKey(eventKey: string) {
    return `webhook:replay:${eventKey}`;
  }
}
