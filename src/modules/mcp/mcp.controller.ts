import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpAuthGuard } from './guards/mcp-auth.guard';
import { SseTransportManager } from './transports/sse-transport.manager';
import { McpServerService } from './mcp-server.service';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly sseManager: SseTransportManager,
    private readonly mcpServerService: McpServerService,
  ) {}

  @Get('sse')
  @UseGuards(McpAuthGuard)
  async handleSse(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.sseManager.handleSseConnection(req, res);
  }

  @Post('messages')
  @UseGuards(McpAuthGuard)
  async handleMessages(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sseManager.handlePostMessage(req, res);
  }

  @Get('tools')
  @UseGuards(McpAuthGuard)
  listTools() {
    return {
      tools: this.mcpServerService.getRegisteredTools().map((t) => ({
        name: t.name,
        description: t.description,
      })),
    };
  }
}
