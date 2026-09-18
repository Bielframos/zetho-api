import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServerService } from '../mcp-server.service';

interface SseSession {
  transport: SSEServerTransport;
  server: McpServer;
  createdAt: Date;
}

@Injectable()
export class SseTransportManager implements OnModuleDestroy {
  private readonly logger = new Logger(SseTransportManager.name);
  private readonly sessions = new Map<string, SseSession>();

  constructor(private readonly mcpServerService: McpServerService) {}

  /**
   * Inicializa uma conexão SSE com o cliente MCP remoto e conecta um servidor dedicado.
   */
  async handleSseConnection(req: Request, res: Response): Promise<void> {
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = this.mcpServerService.createServer();
    const sessionId = transport.sessionId;

    this.sessions.set(sessionId, {
      transport,
      server,
      createdAt: new Date(),
    });

    this.logger.log(`Nova sessão SSE MCP estabelecida: ${sessionId}`);

    req.on('close', () => {
      void (async () => {
        this.logger.log(`Conexão SSE MCP encerrada pelo cliente: ${sessionId}`);
        this.sessions.delete(sessionId);
        try {
          await server.close();
        } catch (err) {
          this.logger.warn(
            `Erro ao fechar servidor da sessão ${sessionId}: ${err}`,
          );
        }
      })();
    });

    await server.connect(transport);
  }

  /**
   * Processa uma mensagem JSON-RPC POST enviada por um cliente de uma sessão SSE ativa.
   */
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    const sessionId = (req.query?.sessionId ||
      req.headers['mcp-session-id']) as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        error: 'MISSING_SESSION_ID',
        message: 'O parâmetro "sessionId" é obrigatório para enviar mensagens.',
      });
      return;
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: `Sessão MCP "${sessionId}" não encontrada ou expirada.`,
      });
      return;
    }

    await session.transport.handlePostMessage(req, res, req.body);
  }

  /**
   * Retorna a quantidade de sessões ativas.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  async onModuleDestroy() {
    this.logger.log('Encerrando todas as sessões SSE ativas do MCP...');
    for (const [sessionId, session] of this.sessions.entries()) {
      try {
        await session.server.close();
      } catch (err) {
        this.logger.warn(`Erro ao encerrar sessão ${sessionId}: ${err}`);
      }
    }
    this.sessions.clear();
  }
}
