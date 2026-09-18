import { Inject, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_SERVER_INFO, MCP_TOOLS } from './mcp.constants';
import { McpToolDefinition } from './interfaces/mcp-tool.interface';

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);

  constructor(
    @Inject(MCP_TOOLS)
    private readonly tools: McpToolDefinition[],
  ) {}

  /**
   * Fábrica que cria uma nova instância de McpServer isolada com todas as tools registradas.
   */
  createServer(): McpServer {
    const server = new McpServer(MCP_SERVER_INFO);

    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.schema, async (args) => {
        return await tool.execute(args as never);
      });
    }

    return server;
  }

  /**
   * Conecta um servidor MCP ao transporte Stdio (padrão para clientes desktop locais).
   */
  async connectStdio(): Promise<McpServer> {
    const server = this.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return server;
  }

  /**
   * Retorna as ferramentas registradas no servidor.
   */
  getRegisteredTools(): McpToolDefinition[] {
    return [...this.tools];
  }
}
