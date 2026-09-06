import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';

@Injectable()
export class AppwriteHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly appwrite: Appwrite,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.appwrite.users.list({
        total: false,
        queries: [Query.limit(1)],
      });

      return indicator.up();
    } catch {
      return indicator.down({
        message: 'Appwrite connectivity unavailable',
      });
    }
  }
}
