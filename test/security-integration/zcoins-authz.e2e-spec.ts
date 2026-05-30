import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ZCoinsController } from '../../src/modules/zcoins/zcoins.controller';
import { ZCoinsService } from '../../src/modules/zcoins/zcoins.service';
import { AppwriteSessionGuard } from '../../src/common/guards/session.guard';
import { Roles } from '../../src/common/guards/roles.decorator';

type GuardUser = {
  $id: string;
  labels: string[];
};

class SessionGuardStub implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autorização não fornecido');
    }

    const token = authHeader.split(' ')[1];
    let user: GuardUser;

    if (token === 'regular-user') {
      user = { $id: 'session-user-1', labels: ['user'] };
    } else if (token === 'forbidden-user') {
      throw new ForbiddenException(
        'Usuário sem as roles necessárias para acessar este recurso',
      );
    } else if (token === 'guest-user') {
      user = { $id: 'session-user-2', labels: [] };
    } else {
      throw new UnauthorizedException(
        'Sessão do Appwrite inválida ou expirada',
      );
    }

    const requiredRoles = Reflect.getMetadata(Roles, context.getHandler()) as
      | string[]
      | undefined;

    if (requiredRoles?.length) {
      const userLabels = [...user.labels, 'user'];
      const hasRequiredRoles = requiredRoles.every((role) =>
        userLabels.includes(role),
      );

      if (!hasRequiredRoles) {
        throw new ForbiddenException(
          'Usuário sem as roles necessárias para acessar este recurso',
        );
      }
    }

    req.user = user;
    return true;
  }
}

describe('ZCoins authorization contract (e2e)', () => {
  let app: INestApplication;
  const zCoinsService = {
    applyInput: jest.fn(),
    applyOutput: jest.fn(),
    getWeeklyLeaderboard: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleBuilder = Test.createTestingModule({
      controllers: [ZCoinsController],
      providers: [
        {
          provide: ZCoinsService,
          useValue: zCoinsService,
        },
      ],
    })
      .overrideGuard(AppwriteSessionGuard)
      .useClass(SessionGuardStub);

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 401 for unauthenticated protected mutation', async () => {
    await request(app.getHttpServer())
      .post('/zcoins/input')
      .send({ reason: 'daily_login' })
      .expect(401);

    expect(zCoinsService.applyInput).not.toHaveBeenCalled();
  });

  it('returns explicit 403 when authenticated caller lacks required role', async () => {
    await request(app.getHttpServer())
      .post('/zcoins/output')
      .set('authorization', 'Bearer forbidden-user')
      .send({ reason: 'raffle' })
      .expect(403);

    expect(zCoinsService.applyOutput).not.toHaveBeenCalled();
  });

  it('binds actor identity to authenticated session and ignores body userId', async () => {
    zCoinsService.applyInput.mockResolvedValue({ success: true });

    await request(app.getHttpServer())
      .post('/zcoins/input')
      .set('authorization', 'Bearer regular-user')
      .send({
        userId: 'spoofed-user-id',
        reason: 'daily_login',
        bonusId: 'bonus-1',
      })
      .expect(201);

    expect(zCoinsService.applyInput).toHaveBeenCalledWith(
      'session-user-1',
      'daily_login',
      'bonus-1',
    );
    expect(zCoinsService.applyInput).not.toHaveBeenCalledWith(
      'spoofed-user-id',
      expect.anything(),
      expect.anything(),
    );
  });

  it('returns deterministic denial payload semantics for auth failures', async () => {
    const unauthenticated = await request(app.getHttpServer())
      .post('/zcoins/input')
      .send({ reason: 'daily_login' })
      .expect(401);

    expect(unauthenticated.body).toMatchObject({
      statusCode: 401,
      message: expect.any(String),
      error: 'Unauthorized',
    });
  });
});
