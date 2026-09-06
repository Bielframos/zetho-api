import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DashboardController } from './dashboard.controller';
import { PublicListsQueryDto } from './dashboard.dto';

describe('DashboardController public lists', () => {
  const makeController = () => {
    const dashboardService = {
      getPublicLists: jest.fn().mockResolvedValue({ items: [] }),
    };
    return {
      controller: new DashboardController(dashboardService as any),
      dashboardService,
    };
  };

  const transformQuery = (value: Record<string, unknown>) =>
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }).transform(value, {
      type: 'query',
      metatype: PublicListsQueryDto,
      data: undefined,
    });

  it('exposes the exact GET /lists/public route', () => {
    const handler = DashboardController.prototype.getPublicLists;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('lists/public');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('dispatches anonymous requests with pagination defaults', async () => {
    const { controller, dashboardService } = makeController();

    await controller.getPublicLists({ user: null }, {});

    expect(dashboardService.getPublicLists).toHaveBeenCalledWith(
      undefined,
      1,
      12,
    );
  });

  it('passes the optional viewer and validated pagination to the service', async () => {
    const { controller, dashboardService } = makeController();
    const query = (await transformQuery({
      page: '2',
      pageSize: '50',
    })) as PublicListsQueryDto;

    await controller.getPublicLists({ user: { $id: 'viewer-1' } }, query);

    expect(dashboardService.getPublicLists).toHaveBeenCalledWith(
      'viewer-1',
      2,
      50,
    );
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { pageSize: '0' },
    { pageSize: '51' },
  ])('rejects out-of-bounds pagination: %o', async (query) => {
    await expect(transformQuery(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
