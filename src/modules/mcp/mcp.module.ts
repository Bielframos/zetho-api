import { ListsModule } from '../lists/lists.module';
import { SubmitEditorialListTool } from './tools/submit-editorial-list.tool';
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
  imports: [IGDBModule, GameModule, ListsModule],
  controllers: [McpController],
  providers: [
    SubmitEditorialListTool,
    RegisterIgdbGameTool,
    RegisterManualGameTool,
    {
      provide: MCP_TOOLS,
      useFactory: (
        igdbTool: RegisterIgdbGameTool,
        manualTool: RegisterManualGameTool,
        editorialTool: SubmitEditorialListTool,
      ) => [igdbTool, manualTool, editorialTool],
      inject: [
        RegisterIgdbGameTool,
        RegisterManualGameTool,
        SubmitEditorialListTool,
      ],
    },
    McpServerService,
    SseTransportManager,
    McpAuthGuard,
  ],
  exports: [McpServerService, MCP_TOOLS],
})
export class McpModule {}
