import { RegisterManualGameTool } from './register-manual-game.tool';

describe('RegisterManualGameTool', () => {
  let tool: RegisterManualGameTool;
  let manualGameServiceMock: {
    createManualGame: jest.Mock;
  };

  beforeEach(() => {
    manualGameServiceMock = {
      createManualGame: jest.fn(),
    };
    tool = new RegisterManualGameTool(manualGameServiceMock as any);
  });

  it('successfully executes manual game registration', async () => {
    manualGameServiceMock.createManualGame.mockResolvedValueOnce({
      success: true,
      action: 'created_manually',
      gameId: 'manual_1',
      game: {
        $id: 'manual_1',
        name: 'Jogo Brasileiro Indie',
        slug: 'jogo-brasileiro-indie',
        externalReference: -1,
        syncStage: 'full',
      },
    });

    const result = await tool.execute({
      name: 'Jogo Brasileiro Indie',
      summary: 'Um jogo feito no Brasil',
      releaseYear: '2025',
    });

    expect(manualGameServiceMock.createManualGame).toHaveBeenCalledWith({
      name: 'Jogo Brasileiro Indie',
      summary: 'Um jogo feito no Brasil',
      releaseYear: '2025',
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.gameId).toBe('manual_1');
    expect(payload.game.name).toBe('Jogo Brasileiro Indie');
  });

  it('handles service errors gracefully', async () => {
    manualGameServiceMock.createManualGame.mockRejectedValueOnce(
      new Error('Erro interno ao salvar'),
    );

    const result = await tool.execute({
      name: 'Jogo com erro',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('MANUAL_CREATION_FAILED');
    expect(payload.message).toContain('Erro interno ao salvar');
  });
});
