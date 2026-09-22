import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Appwrite } from '../../infra/appwrite/appwrite.provider';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { AppwriteHealthIndicator } from './indicators/appwrite-health.indicator';

const HEALTH_SLO_TARGETS = {
  availability: {
    errorRate5xxMax: 0.01,
    description: 'Critical endpoints should remain below 1% 5xx responses.',
  },
  latency: {
    p95MsMax: 500,
    description: 'API reads should stay within a 500ms p95 target.',
  },
  freshness: {
    igdbSyncLagMinutesMax: 60,
    description: 'IGDB sync lag should stay within one hour.',
  },
  deferred: [
    'Dashboards and automated alerting remain out of scope for this phase.',
  ],
} as const;

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly appwriteHealthIndicator: AppwriteHealthIndicator,
    private readonly appwrite: Appwrite,
  ) {}

  @Get('health')
  checkLiveness() {
    return {
      status: 'ok',
    };
  }

  @Get('health/ready')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 350 * 1024 * 1024),
      () => this.appwriteHealthIndicator.isHealthy('appwrite'),
    ]);
  }

  @Get('health/release')
  @Header('Cache-Control', 'no-store')
  async checkRelease() {
    await this.checkReadiness();
    const database = await this.appwrite.tablesDB.get({ databaseId: 'app' });
    if (!database.enabled)
      throw new ServiceUnavailableException('Manutenção em andamento');
    return {
      status: 'ok',
      version: '0.12.0',
      capabilities: ['social-writes-v1'],
    };
  }

  @Get('health/slo')
  getSloTargets() {
    return HEALTH_SLO_TARGETS;
  }
}
