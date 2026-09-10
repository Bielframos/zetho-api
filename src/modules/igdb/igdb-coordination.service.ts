import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IGDBCoordinationService implements OnModuleDestroy {
  private readonly logger = new Logger(IGDBCoordinationService.name);

  // Assuming REDIS_URL is provided in env, else fallback to localhost
  private readonly redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );

  async onModuleDestroy() {
    try {
      await this.redis.quit();
      this.logger.debug('Redis client disconnected successfully.');
    } catch (error) {
      this.logger.error('Error disconnecting Redis client', error);
    }
  }

  private readonly RATE_LIMIT_KEY = 'igdb:rate_limit:count';

  private readonly TOKEN_KEY = 'igdb:token';

  /**
   * Applies distributed rate limiting using Redis.
   * Ensures we don't exceed MAX_REQUESTS_PER_SECOND across all instances.
   */
  async applyRateLimit(): Promise<void> {
    while (true) {
      const wait = Number(
        await this.redis.eval(
          `
        local now = tonumber(ARGV[1])
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 1000)
        if redis.call('ZCARD', KEYS[1]) < 4 then
          redis.call('ZADD', KEYS[1], now, ARGV[2])
          redis.call('PEXPIRE', KEYS[1], 2000)
          return 0
        end
        local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
        return math.max(10, 1010 - (now - tonumber(oldest[2])))
      `,
          1,
          this.RATE_LIMIT_KEY,
          Date.now(),
          `${Date.now()}-${Math.random()}`,
        ),
      );
      if (wait === 0) return;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  /**
   * Gets the cached IGDB token from Redis.
   */
  async getCachedToken(): Promise<string | null> {
    return await this.redis.get(this.TOKEN_KEY);
  }

  /**
   * Caches the IGDB token in Redis with the specified expiry.
   */
  async cacheToken(token: string, expiresInSeconds: number): Promise<void> {
    // Save to Redis and set TTL
    // Subtracting a small buffer (e.g., 60 seconds) from expiry to be safe
    const ttl = Math.max(0, expiresInSeconds - 60);
    if (ttl > 0) {
      await this.redis.setex(this.TOKEN_KEY, ttl, token);
      this.logger.log(`IGDB Token cached in Redis, valid for ${ttl} seconds.`);
    }
  }
}
