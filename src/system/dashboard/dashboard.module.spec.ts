import { Test } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { OutboxService } from 'src/infra/events/outbox.service';
import { DashboardModule } from './dashboard.module';
import { DashboardService } from './dashboard.service';
import { DashboardListsService } from './dashboard-lists.service';
import { DashboardEntrySocialService } from './dashboard-entry-social.service';
import { DashboardProfilesService } from './dashboard-profiles.service';
import { TimelineService } from './timeline.service';

describe('DashboardModule', () => {
  it('wires list reads through the dedicated list provider', async () => {
    const tablesDB = {
      listRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    };
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DashboardModule),
    ).toContain(DashboardListsService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DashboardModule),
    ).toContain(DashboardEntrySocialService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DashboardModule),
    ).toContain(DashboardProfilesService);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        DashboardListsService,
        DashboardEntrySocialService,
        DashboardProfilesService,
        { provide: Appwrite, useValue: { tablesDB } },
        { provide: OutboxService, useValue: { enqueueImmediate: jest.fn() } },
        { provide: TimelineService, useValue: { page: jest.fn() } },
      ],
    }).compile();

    await expect(
      moduleRef.get(DashboardService).getPublicLists(undefined, 1, 12),
    ).resolves.toMatchObject({ items: [], total: 0, page: 1, pageSize: 12 });
    expect(tablesDB.listRows).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'lists' }),
    );
    await moduleRef.close();
  });
});
