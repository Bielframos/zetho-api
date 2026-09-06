import './crypto-polyfill';
import * as dotenv from 'dotenv';
dotenv.config();

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * O header `Origin` nunca traz barra final, mas as variáveis de ambiente são
 * cadastradas com ela (`https://www.zetho.app/`). Comparar os dois diretamente
 * faz o CORS nunca casar em produção — nenhum header
 * `access-control-allow-origin` é emitido e o front quebra.
 * Aceita lista separada por vírgula para acomodar apex + www.
 */
function resolveAllowedOrigins(): string[] {
  const raw = [process.env.FRONTEND_APP_URL, process.env.FRONTEND_APP_URL_EXTRA]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(','));

  const normalized = raw
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return [...new Set(normalized)];
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const logJson = process.env.LOG_JSON === 'true' || isProduction;
  const logColors = process.env.LOG_COLORS !== 'false' && !logJson;

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new ConsoleLogger({
      prefix: 'ZETHO API',
      json: logJson,
      colors: logColors,
    }),
  });

  const allowedOrigins = resolveAllowedOrigins();

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      'FRONTEND_APP_URL é obrigatório em produção para configurar o CORS.',
    );
  }

  app.enableCors({
    origin: isProduction ? allowedOrigins : true,
    credentials: true,
  });

  app.use(cookieParser());
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
