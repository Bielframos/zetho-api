import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { ProfileController } from './profile.controller';
import { ProfileEntriesService } from './profile-entries.service';
import { ProfileService } from './profile.service';

describe('GET /profile/:fingerprint/entries', () => {
  let app: INestApplication;
  const list = jest.fn().mockResolvedValue({ rows: [], total: 0 });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: {} },
        { provide: ProfileEntriesService, useValue: { list } },
        { provide: Appwrite, useValue: {} },
        { provide: CACHE_MANAGER, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => list.mockClear());

  it('serves anonymous profiles and transforms grouping/pagination options', async () => {
    await request(app.getHttpServer())
      .get(
        '/profile/public-fingerprint/entries?group=release-year&status=playing&limit=16&offset=32',
      )
      .expect(200, { rows: [], total: 0 });
    expect(list).toHaveBeenCalledWith('public-fingerprint', {
      group: 'release-year',
      status: 'playing',
      limit: 16,
      offset: 32,
    });
  });

  it('rejects invalid query parameters before accessing the library', async () => {
    await request(app.getHttpServer())
      .get('/profile/public-fingerprint/entries?group=invalid&limit=0')
      .expect(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('keeps existing administrative profile routes authenticated', async () => {
    await request(app.getHttpServer()).get('/profile').expect(401);
    expect(list).not.toHaveBeenCalled();
  });
});
