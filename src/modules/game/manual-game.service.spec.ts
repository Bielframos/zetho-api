import { BadRequestException } from '@nestjs/common';
import { ManualGameService } from './manual-game.service';

describe('ManualGameService', () => {
  let service: ManualGameService;
  let tableDBMock: {
    listRows: jest.Mock;
    createRow: jest.Mock;
  };
  let upsertServiceMock: {
    ensureGameZStats: jest.Mock;
  };

  beforeEach(() => {
    tableDBMock = {
      listRows: jest.fn(),
      createRow: jest.fn(),
    };
    upsertServiceMock = {
      ensureGameZStats: jest.fn().mockResolvedValue(undefined),
    };

    const appwriteMock = {
      tablesDB: tableDBMock,
    } as any;

    service = new ManualGameService(appwriteMock, upsertServiceMock as any);
  });

  it('throws BadRequestException if name is empty', async () => {
    await expect(service.createManualGame({ name: '   ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates manual game with next negative externalReference and calls ensureGameZStats', async () => {
    // 1st listRows: slug check -> no collision
    tableDBMock.listRows.mockResolvedValueOnce({ rows: [] });
    // 2nd listRows: lowest negative externalReference -> none exist yet
    tableDBMock.listRows.mockResolvedValueOnce({ rows: [] });
    // createRow succeeds
    tableDBMock.createRow.mockResolvedValueOnce({ $id: 'manual_1' });

    const result = await service.createManualGame({
      name: 'Meu Jogo Indie',
      summary: 'Um jogo incrível criado manualmente',
      releaseYear: '2024',
      developer: 'Estúdio Z',
    });

    expect(result.success).toBe(true);
    expect(result.gameId).toBe('manual_1');
    expect(result.game.externalReference).toBe(-1);
    expect(result.game.slug).toBe('meu-jogo-indie');
    expect(result.game.syncStage).toBe('full');

    expect(tableDBMock.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: 'app',
        tableId: 'games',
        rowId: 'manual_1',
        data: expect.objectContaining({
          name: 'Meu Jogo Indie',
          slug: 'meu-jogo-indie',
          externalReference: -1,
          syncStage: 'full',
          releaseYear: '2024',
          involvedCompanies: ['c_estudio-z'],
        }),
      }),
    );

    expect(tableDBMock.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: 'app',
        tableId: 'companies',
        rowId: 'c_estudio-z',
        data: expect.objectContaining({
          name: 'Estúdio Z',
          slug: 'estudio-z',
        }),
      }),
    );

    expect(upsertServiceMock.ensureGameZStats).toHaveBeenCalledWith('manual_1');
  });

  it('allocates next negative integer if existing negative games exist', async () => {
    // slug check -> no collision
    tableDBMock.listRows.mockResolvedValueOnce({ rows: [] });
    // lowest negative -> -5
    tableDBMock.listRows.mockResolvedValueOnce({
      rows: [{ externalReference: -5 }],
    });
    tableDBMock.createRow.mockResolvedValueOnce({ $id: 'manual_6' });

    const result = await service.createManualGame({
      name: 'Outro Jogo',
    });

    expect(result.game.externalReference).toBe(-6);
    expect(result.gameId).toBe('manual_6');
  });

  it('resolves slug collision with numerical suffix', async () => {
    // 1st slug check -> 'meu-jogo' exists
    tableDBMock.listRows.mockResolvedValueOnce({
      rows: [{ slug: 'meu-jogo' }],
    });
    // 2nd slug check -> 'meu-jogo-2' is free
    tableDBMock.listRows.mockResolvedValueOnce({ rows: [] });
    // lowest negative -> none
    tableDBMock.listRows.mockResolvedValueOnce({ rows: [] });
    tableDBMock.createRow.mockResolvedValueOnce({ $id: 'manual_1' });

    const result = await service.createManualGame({
      name: 'Meu Jogo',
    });

    expect(result.game.slug).toBe('meu-jogo-2');
  });
});
