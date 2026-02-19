import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiModule } from 'src/common/ai/ai.module';
import { AppwriteModule } from 'src/common/appwrite/appwrite.module';
import { RpgModule } from 'src/modules/rpg/rpg.module';
import request from 'supertest';
import { App } from 'supertest/types';

describe('RpgController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RpgModule, AiModule, AppwriteModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/rpg/system/start-story (POST)', () => {
    return request(app.getHttpServer())
      .post('/rpg/system/start-story')
      .send({ gameSlug: 'state-of-decay-2' })
      .expect(201);
  });
});
