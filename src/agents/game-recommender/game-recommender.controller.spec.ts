/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { GameRecommenderController } from './game-recommender.controller';
import { GameRecommenderService } from './game-recommender.service';

describe('GameRecommenderController', () => {
  const recommender = { suggest: jest.fn(), history: jest.fn() };

  async function createApp(authenticated = true) {
    const module = await Test.createTestingModule({
      controllers: [GameRecommenderController],
      providers: [{ provide: GameRecommenderService, useValue: recommender }],
    })
      .overrideGuard(AppwriteSessionGuard)
      .useValue({
        canActivate: (context: any) => {
          if (!authenticated) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = { $id: 'session-user' };
          return true;
        },
      })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it('histórico exige sessão e usa sua identidade com paginação validada', async () => {
    const app = await createApp();
    recommender.history.mockResolvedValueOnce({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get(
        '/agents/game-recommender/suggestions?userId=other&limit=5&cursor=rec-1',
      )
      .expect(200, { items: [], nextCursor: null });
    expect(recommender.history).toHaveBeenCalledWith(
      'session-user',
      5,
      'rec-1',
    );
    for (const query of [
      'limit=51',
      'limit=0',
      'limit=1.5',
      'cursor=invalid%20cursor',
    ]) {
      await request(app.getHttpServer())
        .get(`/agents/game-recommender/suggestions?${query}`)
        .expect(400);
    }
    await app.close();
    const unauthenticated = await createApp(false);
    await request(unauthenticated.getHttpServer())
      .get('/agents/game-recommender/suggestions')
      .expect(401);
    await unauthenticated.close();
  });

  it('usa exclusivamente a identidade da sessão e aplica scope any por padrão', async () => {
    const app = await createApp();
    recommender.suggest.mockResolvedValue({ id: 'recommendation-1' });

    await request(app.getHttpServer())
      .post('/agents/game-recommender/suggestions')
      .set('Idempotency-Key', '4de20dee-2306-41cf-a98e-7cfc793dcb67')
      .send({ userId: 'attacker', ownerFingerprint: 'spoofed' })
      .expect(201);

    expect(recommender.suggest).toHaveBeenCalledWith(
      'session-user',
      'any',
      '4de20dee-2306-41cf-a98e-7cfc793dcb67',
    );
    await app.close();
  });

  it.each([
    [{ scope: 'invalid' }, 'valid-key'],
    [{ scope: 'new' }, 'invalid key with spaces'],
  ])('rejeita scope ou chave inválidos antes do serviço', async (body, key) => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/agents/game-recommender/suggestions')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(400);
    expect(recommender.suggest).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejeita a ausência do Idempotency-Key', async () => {
    const controller = new GameRecommenderController(recommender as never);
    await expect(
      controller.createSuggestion(
        { user: { $id: 'user-1' } } as never,
        undefined,
        {
          scope: 'any',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna 401 sem uma sessão autenticada', async () => {
    const app = await createApp(false);
    await request(app.getHttpServer())
      .post('/agents/game-recommender/suggestions')
      .set('Idempotency-Key', 'valid-key')
      .send({ scope: 'any' })
      .expect(401);
    expect(recommender.suggest).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    [new BadRequestException('Saldo insuficiente'), 400],
    [new ConflictException('Em andamento'), 409],
    [new UnprocessableEntityException('Sem candidatos'), 422],
    [new BadGatewayException('Falha do provedor'), 502],
  ])('preserva o contrato de erro HTTP %#', async (error, status) => {
    const app = await createApp();
    recommender.suggest.mockRejectedValueOnce(error);
    await request(app.getHttpServer())
      .post('/agents/game-recommender/suggestions')
      .set('Idempotency-Key', 'valid-key')
      .send({ scope: 'any' })
      .expect(status);
    await app.close();
  });
});
