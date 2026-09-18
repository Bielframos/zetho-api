import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { z } from 'zod';
import { McpController } from 'src/modules/mcp/mcp.controller';
import { McpServerService } from 'src/modules/mcp/mcp-server.service';
import { SseTransportManager } from 'src/modules/mcp/transports/sse-transport.manager';
import { McpAuthGuard } from 'src/modules/mcp/guards/mcp-auth.guard';
import { MCP_TOOLS } from 'src/modules/mcp/mcp.constants';

describe('McpController (e2e)', () => {
  let app: INestApplication;

  const mockTool = {
    name: 'register_igdb_game',
    description: 'Mock IGDB tool',
    schema: { query: z.string().optional() },
    execute: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
  };

  beforeAll(async () => {
    process.env.MCP_API_KEY = 'test-mcp-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpServerService,
        SseTransportManager,
        McpAuthGuard,
        {
          provide: MCP_TOOLS,
          useValue: [mockTool],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated requests to /mcp/tools', async () => {
    await request(app.getHttpServer()).get('/mcp/tools').expect(401);
  });

  it('allows authenticated requests to /mcp/tools via x-api-key', async () => {
    const response = await request(app.getHttpServer())
      .get('/mcp/tools')
      .set('x-api-key', 'test-mcp-key')
      .expect(200);

    expect(response.body.tools).toBeDefined();
    expect(response.body.tools[0].name).toBe('register_igdb_game');
  });

  it('allows authenticated requests via query parameter ?apiKey=', async () => {
    const response = await request(app.getHttpServer())
      .get('/mcp/tools?apiKey=test-mcp-key')
      .expect(200);

    expect(response.body.tools).toBeDefined();
    expect(response.body.tools[0].name).toBe('register_igdb_game');
  });
});
