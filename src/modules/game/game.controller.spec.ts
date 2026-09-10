import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameBriefingService } from './game-briefing.service';
import { OptionalAppwriteSessionGuard } from 'src/common/guards/optional-session.guard';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';

describe('GET /games/search', () => {
  let app: INestApplication;
  const search = jest.fn().mockResolvedValue({ results: [] });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GameController],
      providers: [
        { provide: GameService, useValue: { search } },
        { provide: GameBriefingService, useValue: {} },
      ],
    })
      .overrideGuard(OptionalAppwriteSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AppwriteSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => search.mockClear());
  it('transforms pagination and passes company filters', async () => {
    await request(app.getHttpServer())
      .get('/games/search?q=gta&page=2&pageSize=20&publisher=igdb_5')
      .expect(200);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'gta',
        page: 2,
        pageSize: 20,
        publisher: 'igdb_5',
      }),
    );
  });
  it.each([
    'page=0',
    'page=abc',
    'pageSize=101',
    'pageSize=1.5',
    'year=abc',
    'developer=foo',
    'q=' + 'a'.repeat(129),
  ])('rejects %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/games/search?${query}`)
      .expect(400);
    expect(search).not.toHaveBeenCalled();
  });
});
