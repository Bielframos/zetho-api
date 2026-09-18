import { McpController } from './mcp.controller';

describe('McpController', () => {
  let controller: McpController;
  let sseManagerMock: {
    handleSseConnection: jest.Mock;
    handlePostMessage: jest.Mock;
  };
  let mcpServerServiceMock: {
    getRegisteredTools: jest.Mock;
  };

  beforeEach(() => {
    sseManagerMock = {
      handleSseConnection: jest.fn().mockResolvedValue(undefined),
      handlePostMessage: jest.fn().mockResolvedValue(undefined),
    };
    mcpServerServiceMock = {
      getRegisteredTools: jest.fn().mockReturnValue([
        { name: 'register_igdb_game', description: 'IGDB tool' },
        { name: 'register_manual_game', description: 'Manual tool' },
      ]),
    };

    controller = new McpController(
      sseManagerMock as any,
      mcpServerServiceMock as any,
    );
  });

  it('delegates SSE connection to SseTransportManager', async () => {
    const req = {} as any;
    const res = {} as any;

    await controller.handleSse(req, res);

    expect(sseManagerMock.handleSseConnection).toHaveBeenCalledWith(req, res);
  });

  it('delegates POST messages to SseTransportManager', async () => {
    const req = {} as any;
    const res = {} as any;

    await controller.handleMessages(req, res);

    expect(sseManagerMock.handlePostMessage).toHaveBeenCalledWith(req, res);
  });

  it('returns list of registered tools', () => {
    const result = controller.listTools();

    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('register_igdb_game');
    expect(result.tools[1].name).toBe('register_manual_game');
  });
});
