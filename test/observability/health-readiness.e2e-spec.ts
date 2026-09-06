import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

describe('Health readiness contract (e2e)', () => {
  let app: INestApplication;
  let HealthModule: typeof import('../../src/system/health/health.module').HealthModule;
  let AppwriteHealthIndicator: typeof import('../../src/system/health/indicators/appwrite-health.indicator').AppwriteHealthIndicator;

  const mockAppwriteHealthIndicator = {
    isHealthy: jest.fn().mockResolvedValue({
      appwrite: {
        status: 'up',
      },
    }),
  } as unknown as typeof import('../../src/system/health/indicators/appwrite-health.indicator').AppwriteHealthIndicator;

  beforeAll(async () => {
    process.env.APPWRITE_PROJECT = 'test-project';
    process.env.APPWRITE_ENDPOINT = 'https://appwrite.invalid';
    process.env.APPWRITE_API_KEY = 'test-key';

    ({ HealthModule } = require('../../src/system/health/health.module'));
    ({
      AppwriteHealthIndicator,
    } = require('../../src/system/health/indicators/appwrite-health.indicator'));
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(AppwriteHealthIndicator)
      .useValue(mockAppwriteHealthIndicator)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns a lightweight liveness payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns readiness success when Appwrite is reachable', async () => {
    mockAppwriteHealthIndicator.isHealthy = jest.fn().mockResolvedValue({
      appwrite: {
        status: 'up',
      },
    }) as never;

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      details: {
        appwrite: {
          status: 'up',
        },
      },
    });
  });

  it('returns non-200 readiness when Appwrite fails', async () => {
    mockAppwriteHealthIndicator.isHealthy = jest.fn().mockResolvedValue({
      appwrite: {
        status: 'down',
        message: 'Appwrite connectivity unavailable',
      },
    }) as never;

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).not.toBe(200);
  });

  it('publishes machine-readable SLI/SLO targets', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/slo')
      .expect(200);

    expect(response.body).toMatchObject({
      availability: {
        errorRate5xxMax: 0.01,
      },
      latency: {
        p95MsMax: 500,
      },
      freshness: {
        igdbSyncLagMinutesMax: 60,
      },
      deferred: expect.arrayContaining([
        'Dashboards and automated alerting remain out of scope for this phase.',
      ]),
    });
  });
});
