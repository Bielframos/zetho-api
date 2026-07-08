import { CacheModule } from '@nestjs/cache-manager';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import crypto from 'crypto';
import request from 'supertest';
import { WebhookController } from '../../src/modules/webhook/webhook.controller';
import { ZethoHandler } from '../../src/modules/webhook/handlers/zetho.handler';
import { IGDBHandler } from '../../src/modules/webhook/handlers/igdb.handler';
import { WebhookReplayService } from '../../src/modules/webhook/replay/replay.service';

describe('Webhook integration contract (e2e)', () => {
  let app: INestApplication;

  const zethoHandler = {
    syncEntry: jest.fn(),
  };

  const igdbHandler = {
    upsertGame: jest.fn(),
    upsertGenre: jest.fn(),
    deleteGenre: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    process.env.APP_URL = 'http://localhost:3000';
    process.env.APPWRITE_WEBHOOK_SIGNATURE = 'webhook-secret';
    process.env.IGDB_WEBHOOK_SECRET = 'igdb-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [WebhookController],
      providers: [
        WebhookReplayService,
        {
          provide: ZethoHandler,
          useValue: zethoHandler,
        },
        {
          provide: IGDBHandler,
          useValue: igdbHandler,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const signEntrySync = (rawPayload: string) => {
    const message = `${process.env.APP_URL}/webhook/entry-sync${rawPayload}`;
    return crypto
      .createHmac('sha1', process.env.APPWRITE_WEBHOOK_SIGNATURE as string)
      .update(message)
      .digest('base64');
  };

  it('rejects invalid signature/secret with 401', async () => {
    await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .send({ $id: 'entry-1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/webhook/igdb/games/upsert')
      .set('x-secret', 'invalid')
      .send({ id: 42, name: 'Test' })
      .expect(401);
  });

  it('short-circuits duplicate webhook deliveries as 2xx explicit no-op', async () => {
    zethoHandler.syncEntry.mockResolvedValue({ success: true });

    const payload = JSON.stringify({
      $id: 'entry-duplicate',
      ownerFingerprint: 'fp',
      gameId: 'game-1',
      status: 'backlog',
      liked: false,
      hyped: false,
    });

    const signature = signEntrySync(payload);

    await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('content-type', 'application/json')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .set('x-appwrite-webhook-signature', signature)
      .set('x-appwrite-webhook-id', 'evt-1')
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('content-type', 'application/json')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .set('x-appwrite-webhook-signature', signature)
      .set('x-appwrite-webhook-id', 'evt-1')
      .send(payload)
      .expect(201);

    expect(second.body).toMatchObject({
      success: true,
      noOp: true,
      reason: 'duplicate_event',
    });
    expect(zethoHandler.syncEntry).toHaveBeenCalledTimes(1);
  });

  it('returns non-2xx on internal processing failure for retryability', async () => {
    zethoHandler.syncEntry.mockRejectedValue(new Error('provider timeout'));

    const payload = JSON.stringify({
      $id: 'entry-failure',
      ownerFingerprint: 'fp',
      gameId: 'game-2',
      status: 'playing',
      liked: false,
      hyped: false,
    });

    const signature = signEntrySync(payload);

    await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('content-type', 'application/json')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .set('x-appwrite-webhook-signature', signature)
      .set('x-appwrite-webhook-id', 'evt-2')
      .send(payload)
      .expect(503);
  });

  it('validates signature using endpoint-specific environment variable when configured', async () => {
    // Set endpoint-specific secret
    process.env.APPWRITE_WEBHOOK_SIGNATURE_ENTRY_SYNC =
      'endpoint-specific-secret';

    zethoHandler.syncEntry.mockResolvedValue({ success: true });

    const payload = JSON.stringify({
      $id: 'entry-specific-test',
      ownerFingerprint: 'fp',
      gameId: 'game-3',
      status: 'completed',
      liked: true,
      hyped: false,
    });

    const specificMessage = `${process.env.APP_URL}/webhook/entry-sync${payload}`;
    const specificSignature = crypto
      .createHmac('sha1', 'endpoint-specific-secret')
      .update(specificMessage)
      .digest('base64');

    // 1. Sending with the specific signature should pass
    await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('content-type', 'application/json')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .set('x-appwrite-webhook-signature', specificSignature)
      .set('x-appwrite-webhook-id', 'evt-3')
      .send(payload)
      .expect(201);

    // 2. Sending with the global signature should fail with 401
    const globalSignature = crypto
      .createHmac('sha1', process.env.APPWRITE_WEBHOOK_SIGNATURE as string)
      .update(specificMessage)
      .digest('base64');

    await request(app.getHttpServer())
      .post('/webhook/entry-sync')
      .set('content-type', 'application/json')
      .set('x-appwrite-webhook-events', 'databases.*.rows.*.create')
      .set('x-appwrite-webhook-signature', globalSignature)
      .set('x-appwrite-webhook-id', 'evt-4')
      .send(payload)
      .expect(401);

    // Cleanup
    delete process.env.APPWRITE_WEBHOOK_SIGNATURE_ENTRY_SYNC;
  });
});
