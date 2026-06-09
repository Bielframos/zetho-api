import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IGDBCoordinationService {
  private readonly logger = new Logger(IGDBCoordinationService.name);

  // Assuming REDIS_URL is provided in env, else fallback to localhost
  private readonly redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );

  private readonly RATE_LIMIT_KEY = 'igdb:rate_limit:count';
  private readonly MAX_REQUESTS_PER_SECOND = 4;
  private readonly WINDOW_SIZE_MS = 1000;
  private readonly SAFETY_BUFFER_MS = 10;

  private readonly TOKEN_KEY = 'igdb:token';

  /**
   * Applies distributed rate limiting using Redis.
   * Ensures we don't exceed MAX_REQUESTS_PER_SECOND across all instances.
   */
  async applyRateLimit(): Promise<void> {
    while (true) {
      const now = Date.now();
      const windowStart = now - this.WINDOW_SIZE_MS;

      // Use Redis Sorted Set to track timestamps of requests
      // ZREMRANGEBYSCORE removes timestamps older than our window
      await this.redis.zremrangebyscore(
        this.RATE_LIMIT_KEY,
        '-inf',
        windowStart,
      );

      // ZCARD gets the number of requests in the current window
      const count = await this.redis.zcard(this.RATE_LIMIT_KEY);

      if (count < this.MAX_REQUESTS_PER_SECOND) {
        // Add the current request timestamp to the set
        await this.redis.zadd(
          this.RATE_LIMIT_KEY,
          now,
          `${now}-${Math.random()}`,
        );
        // Set expiry on the key so it doesn't grow forever if left alone
        await this.redis.expire(this.RATE_LIMIT_KEY, 2);
        return;
      }

      // If we hit the limit, calculate how long to wait
      // ZRANGE gets the oldest request in the current window
      const oldestRequests = await this.redis.zrange(
        this.RATE_LIMIT_KEY,
        0,
        0,
        'WITHSCORES',
      );
      let timeToWait = this.SAFETY_BUFFER_MS;

      if (oldestRequests && oldestRequests.length > 1) {
        const oldestTimestamp = parseFloat(oldestRequests[1]);
        timeToWait += this.WINDOW_SIZE_MS - (now - oldestTimestamp);
      } else {
        timeToWait += 250; // Fallback wait time
      }

      this.logger.debug(
        `Rate limit reached across instances. Waiting ${timeToWait}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, timeToWait));
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
