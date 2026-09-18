import { z } from 'zod';
import { McpServerService } from './mcp-server.service';
import { McpToolDefinition } from './interfaces/mcp-tool.interface';

describe('McpServerService', () => {
  const dummyTool: McpToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    schema: {
      message: z.string(),
    },
    execute: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    }),
  };

  it('creates an McpServer instance and registers injected tools', () => {
    const service = new McpServerService([dummyTool]);
    const server = service.createServer();

    expect(server).toBeDefined();
    expect(service.getRegisteredTools()).toHaveLength(1);
    expect(service.getRegisteredTools()[0].name).toBe('test_tool');
  });

  it('creates isolated instances with createServer', () => {
    const service = new McpServerService([dummyTool]);
    const server1 = service.createServer();
    const server2 = service.createServer();

    expect(server1).not.toBe(server2);
  });
});
