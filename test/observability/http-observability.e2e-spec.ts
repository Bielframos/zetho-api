import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('HTTP observability contract (e2e)', () => {
  let app: INestApplication<App>;
  let AppController: typeof import('../../src/app.controller').AppController;
  let AppService: typeof import('../../src/app.service').AppService;
  let ObservabilityModule: typeof import('../../src/common/observability/observability.module').ObservabilityModule;
  let CorrelationIdMiddleware: typeof import('../../src/common/middleware/correlation-id.middleware').CorrelationIdMiddleware;

  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {
    return undefined as never;
  });
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {
    return undefined as never;
  });
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
    return undefined as never;
  });

  beforeAll(async () => {
    process.env.APPWRITE_PROJECT = 'test-project';
    process.env.APPWRITE_ENDPOINT = 'https://appwrite.invalid';
    process.env.APPWRITE_API_KEY = 'test-key';
    process.env.OPENAI_KEY = 'test-openai-key';
    process.env.GOOGLE_GENAI_KEY = 'test-google-key';
    process.env.IGDB_CLIENT_ID = 'test-igdb-client';
    process.env.IGDB_CLIENT_SECRET = 'test-igdb-secret';
    process.env.APP_URL = 'http://localhost:3000';

    ({ AppController } = require('../../src/app.controller'));
    ({ AppService } = require('../../src/app.service'));
    ({ ObservabilityModule } = require('../../src/common/observability/observability.module'));
    ({ CorrelationIdMiddleware } = require('../../src/common/middleware/correlation-id.middleware'));
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityModule],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(moduleRef.get(CorrelationIdMiddleware).use.bind(moduleRef.get(CorrelationIdMiddleware)));
    await app.init();
    logSpy.mockClear();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns a correlation id header and structured metrics log', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.headers['x-correlation-id']).toMatch(UUID_V4_REGEX);
    expect(response.text).toBe('Hello World!');

    const metricLog = logSpy.mock.calls
      .map(([payload]) => payload)
      .find(
        (payload) =>
          payload &&
          typeof payload === 'object' &&
          Reflect.get(payload as object, 'component') === 'MetricsInterceptor',
      ) as Record<string, unknown> | undefined;

    expect(metricLog).toMatchObject({
      correlationId: response.headers['x-correlation-id'],
      component: 'MetricsInterceptor',
      operation: 'GET /',
      outcome: 'success',
      method: 'GET',
      path: '/',
      statusCode: 200,
    });
  });

  it('preserves a valid inbound correlation id', async () => {
    const inbound = randomUUID();

    const response = await request(app.getHttpServer())
      .get('/')
      .set('x-correlation-id', inbound)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(inbound);
  });
});
