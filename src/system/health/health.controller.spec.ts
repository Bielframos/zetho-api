import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controller(enabled: boolean) {
  return new HealthController(
    { check: jest.fn().mockResolvedValue({ status: 'ok' }) } as any,
    {} as any,
    {} as any,
    { tablesDB: { get: jest.fn().mockResolvedValue({ enabled }) } } as any,
  );
}

describe('release readiness', () => {
  it('keeps the frontend in maintenance when clients cannot access the database', async () => {
    await expect(controller(false).checkRelease()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('advertises social writes only after readiness and database access succeed', async () => {
    await expect(controller(true).checkRelease()).resolves.toEqual({
      status: 'ok',
      version: '0.15.0',
      capabilities: ['social-writes-v1'],
    });
  });
});
