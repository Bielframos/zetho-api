import { NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';

describe('GameService.findById', () => {
  const tablesDB = { listRows: jest.fn() };
  const appwrite = { tablesDB } as never;
  const cache = { get: jest.fn(), set: jest.fn() } as never;

  const buildService = () =>
    new GameService(appwrite, {} as never, {} as never, cache);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna o jogo pelo $id', async () => {
    tablesDB.listRows.mockResolvedValue({
      rows: [{ $id: 'g1', name: 'Hades II', slug: 'hades-ii' }],
    });

    const game = await buildService().findById('g1', 'name,slug');

    expect(game).toMatchObject({ $id: 'g1', name: 'Hades II' });
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1);
  });

  it('lança NotFoundException quando o id não existe', async () => {
    tablesDB.listRows.mockResolvedValue({ rows: [] });

    await expect(buildService().findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
