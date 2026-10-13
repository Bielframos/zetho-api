import { ConflictException, NotFoundException } from '@nestjs/common';
import { RegisterIgdbGameTool } from './register-igdb-game.tool';

describe('RegisterIgdbGameTool', () => {
  let tool: RegisterIgdbGameTool;
  let igdbServiceMock: {
    importGameById: jest.Mock;
    searchGames: jest.Mock;
    getGamesByIds: jest.Mock;
  };

  beforeEach(() => {
    igdbServiceMock = {
      importGameById: jest.fn(),
      searchGames: jest.fn(),
      getGamesByIds: jest.fn(),
    };
    tool = new RegisterIgdbGameTool(igdbServiceMock as any);
  });

  it('returns error if neither igdbId nor query is provided', async () => {
    const result = await tool.execute({ force: false, searchOnly: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('MISSING_PARAM');
  });

  it('imports game directly by igdbId', async () => {
    igdbServiceMock.importGameById.mockResolvedValueOnce({
      success: true,
      message: 'Jogo importado com sucesso',
      gameId: 'igdb_1020',
    });

    const result = await tool.execute({
      igdbId: 1020,
      force: false,
      searchOnly: false,
    });

    expect(igdbServiceMock.importGameById).toHaveBeenCalledWith(1020, {
      force: false,
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.gameId).toBe('igdb_1020');
  });

  it('handles searchOnly mode without importing', async () => {
    igdbServiceMock.searchGames.mockResolvedValueOnce([
      { id: 111, name: 'Silksong', slug: 'silksong' },
      { id: 222, name: 'Hollow Knight', slug: 'hollow-knight' },
    ]);

    const result = await tool.execute({
      query: 'Silksong',
      force: false,
      searchOnly: true,
    });

    expect(igdbServiceMock.importGameById).not.toHaveBeenCalled();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.mode).toBe('search_only');
    expect(payload.candidates).toHaveLength(2);
    expect(payload.candidates[0].igdbId).toBe(111);
  });

  it('searches and imports top match when only query is provided', async () => {
    igdbServiceMock.searchGames.mockResolvedValueOnce([
      { id: 111, name: 'Silksong', slug: 'silksong' },
      { id: 222, name: 'Hollow Knight', slug: 'hollow-knight' },
    ]);
    igdbServiceMock.importGameById.mockResolvedValueOnce({
      success: true,
      message: 'Jogo Silksong adicionado com sucesso',
      gameId: 'igdb_111',
    });

    const result = await tool.execute({
      query: 'Silksong',
      force: false,
      searchOnly: false,
    });

    expect(igdbServiceMock.importGameById).toHaveBeenCalledWith(111, {
      force: false,
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.action).toBe('imported_from_search');
    expect(payload.registeredGame.igdbId).toBe(111);
    expect(payload.otherCandidates).toHaveLength(1);
    expect(payload.otherCandidates[0].igdbId).toBe(222);
  });

  it('returns formatted error when game is not found', async () => {
    igdbServiceMock.importGameById.mockRejectedValueOnce(
      new NotFoundException('Jogo não encontrado'),
    );

    const result = await tool.execute({
      igdbId: 999999,
      force: false,
      searchOnly: false,
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('NOT_FOUND');
  });

  it('returns friendly suggestion to pass force: true when ConflictException occurs', async () => {
    igdbServiceMock.importGameById.mockRejectedValueOnce(
      new ConflictException('Jogo não elegível para ingestão'),
    );

    const result = await tool.execute({
      igdbId: 555,
      force: false,
      searchOnly: false,
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('NOT_ELIGIBLE');
    expect(payload.message).toContain('force: true');
  });
});
