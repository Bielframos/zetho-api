import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { ProfileComparisonController } from './profile-comparison.controller';
import { ProfileComparisonService } from './profile-comparison.service';

describe('Profile comparison contract', () => {
  let app: INestApplication;
  const compare = jest.fn().mockResolvedValue({ rows: [], total: 0 });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProfileComparisonController],
      providers: [{ provide: ProfileComparisonService, useValue: { compare } }],
    })
      .overrideGuard(AppwriteSessionGuard)
      .useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) return false;
          req.user = { $id: 'visitor' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => compare.mockClear());
  it('requires a session and rejects invalid pagination before querying data', async () => {
    await request(app.getHttpServer()).get('/profile/Peer/compare').expect(403);
    await request(app.getHttpServer())
      .get('/profile/Peer/compare?limit=999&view=private')
      .set('Authorization', 'Bearer jwt')
      .expect(400);
    expect(compare).not.toHaveBeenCalled();
  });
  it('forwards verified identity and session token, validates queries and prevents shared caching', async () => {
    await request(app.getHttpServer())
      .get(
        '/profile/Peer/compare?view=opinions&order=different&offset=20&limit=10',
      )
      .set('Authorization', 'Bearer jwt')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(compare).toHaveBeenCalledWith('visitor', 'jwt', 'Peer', {
      view: 'opinions',
      order: 'different',
      offset: 20,
      limit: 10,
    });
  });
});
