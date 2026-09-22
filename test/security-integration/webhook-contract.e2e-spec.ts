import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WebhookController } from '../../src/modules/webhook/webhook.controller';
import { IGDBHandler } from '../../src/modules/webhook/handlers/igdb.handler';

describe('Webhook integration contract (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.IGDB_WEBHOOK_SECRET = 'igdb-secret';

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: IGDBHandler,
          useValue: {
            upsertGame: jest.fn(),
            upsertGenre: jest.fn(),
            deleteGenre: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    '/webhook/entry-sync',
    '/webhook/timeline',
    '/webhook/comments/on-create',
  ])('does not expose the retired Appwrite endpoint %s', async (path) => {
    await request(app.getHttpServer()).post(path).send({}).expect(404);
  });

  it('still rejects an invalid IGDB secret', async () => {
    await request(app.getHttpServer())
      .post('/webhook/igdb/games/upsert')
      .set('x-secret', 'invalid')
      .send({ id: 42, name: 'Test' })
      .expect(401);
  });
});
