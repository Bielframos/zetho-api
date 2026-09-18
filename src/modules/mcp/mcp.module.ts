import { Module } from '@nestjs/common';
import { IGDBModule } from '../igdb/igdb.module';
import { GameModule } from '../game/game.module';
import { MCP_TOOLS } from './mcp.constants';
import { RegisterIgdbGameTool } from './tools/register-igdb-game.tool';
import { RegisterManualGameTool } from './tools/register-manual-game.tool';
import { McpServerService } from './mcp-server.service';
import { SseTransportManager } from './transports/sse-transport.manager';
import { McpController } from './mcp.controller';
import { McpAuthGuard } from './guards/mcp-auth.guard';

@Module({
  imports: [IGDBModule, GameModule],
  controllers: [McpController],
  providers: [
    RegisterIgdbGameTool,
    RegisterManualGameTool,
    {
      provide: MCP_TOOLS,
      useFactory: (
        igdbTool: RegisterIgdbGameTool,
        manualTool: RegisterManualGameTool,
      ) => [igdbTool, manualTool],
      inject: [RegisterIgdbGameTool, RegisterManualGameTool],
    },
    McpServerService,
    SseTransportManager,
    McpAuthGuard,
  ],
  exports: [McpServerService, MCP_TOOLS],
})
export class McpModule {}
