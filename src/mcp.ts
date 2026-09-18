import './crypto-polyfill';
import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpServerService } from './modules/mcp/mcp-server.service';

async function bootstrap() {
  // CRÍTICO: No transporte Stdio, stdout é reservado estritamente para o protocolo JSON-RPC.
  // Qualquer log impresso em stdout quebra a comunicação com os clientes MCP (Cursor, Claude, etc.).
  // Redirecionamos os logs do NestJS exclusivamente para stderr.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const mcpServerService = app.get(McpServerService);
  await mcpServerService.connectStdio();

  process.stderr.write(
    '[Zetho MCP] Servidor iniciado com sucesso no transporte Stdio.\n',
  );

  const shutdown = async () => {
    process.stderr.write('[Zetho MCP] Encerrando servidor...\n');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  process.stderr.write(
    `[Zetho MCP] Erro fatal na inicialização: ${err?.message || String(err)}\n`,
  );
  process.exit(1);
});
