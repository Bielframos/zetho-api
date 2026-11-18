import { ConflictException } from '@nestjs/common';
import { AppwriteException, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { SpecialThemesService } from './special-themes.service';
const campaigns = require('../../../scripts/special-themes.json') as {
  id: string;
  name: string;
  appearance: string;
  startsAt: string;
  endsAt: string;
}[];

const { id, ...details } = campaigns[0];
const theme = { $id: id, ...details };
const missing = new AppwriteException('not found', 404);

describe('SpecialThemesService', () => {
  const claims = new Map<string, { userId: string; themeId: string }>();
  const getRow = jest.fn(async ({ tableId, rowId }) => {
    if (tableId === 'special_themes' && rowId === id) return theme;
    if (tableId === 'special_theme_claims' && claims.has(rowId))
      return claims.get(rowId);
    throw missing;
  });
  const createRow = jest.fn(async ({ rowId, data }) => {
    if (claims.has(rowId)) throw new AppwriteException('already exists', 409);
    claims.set(rowId, data);
  });
  const listRows = jest.fn();
  const service = new SpecialThemesService({
    tablesDB: { getRow, createRow, listRows },
  } as unknown as Appwrite);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    claims.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('uses an inclusive start and exclusive end in Recife, with no write outside the window', async () => {
    jest.setSystemTime(new Date('2026-11-18T02:59:59.999Z'));
    expect((await service.getCampaign(id)).status).toBe('upcoming');
    await expect(service.claim('player', id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    jest.setSystemTime(new Date('2026-11-18T03:00:00.000Z'));
    expect((await service.getCampaign(id)).status).toBe('open');
    await expect(service.claim('player', id)).resolves.toMatchObject({ id });

    jest.setSystemTime(new Date('2026-11-21T02:59:59.999Z'));
    await expect(service.claim('last-minute', id)).resolves.toMatchObject({
      id,
    });
    jest.setSystemTime(new Date('2026-11-21T03:00:00.000Z'));
    expect((await service.getCampaign(id)).status).toBe('ended');
    await expect(service.claim('too-late', id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.claim('player', id)).resolves.toMatchObject({ id });
    expect(createRow).toHaveBeenCalledTimes(2);
  });

  it('converges on one claim per account and lists only that account’s claims', async () => {
    jest.setSystemTime(new Date('2026-11-19T15:00:00.000Z'));
    await expect(
      Promise.all([service.claim('player', id), service.claim('player', id)]),
    ).resolves.toEqual([
      { id, name: theme.name, appearance: theme.appearance },
      { id, name: theme.name, appearance: theme.appearance },
    ]);
    expect(claims.size).toBe(1);

    listRows
      .mockResolvedValueOnce({ rows: [...claims.values()] })
      .mockResolvedValueOnce({ rows: [theme] });
    await expect(service.listOwned('player')).resolves.toEqual([
      { id, name: theme.name, appearance: theme.appearance },
    ]);
    expect(listRows.mock.calls[0][0].queries).toContain(
      Query.equal('userId', 'player'),
    );

    listRows.mockResolvedValueOnce({ rows: [] });
    await expect(service.listOwned('other')).resolves.toEqual([]);
    expect(listRows.mock.calls[2][0].queries).toContain(
      Query.equal('userId', 'other'),
    );
  });
});
