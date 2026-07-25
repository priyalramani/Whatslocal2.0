import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  // Behind nginx in prod — trust the first proxy hop so req.ip is the real
  // client IP (from X-Forwarded-For), not 127.0.0.1. Without this the rate
  // limiter would bucket ALL users under one IP and hand out random 429s.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Security headers.
  app.use(helmet());

  // CORS allowlist — only our own origins may call the API from a browser.
  // Set CORS_ORIGINS as a comma-separated list (prod domain[s]). Dev default
  // is the local web port.
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5180')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Reject unknown fields; transform/validate every DTO. First line of defence
  // against injection and over-posting.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = Number(process.env.PORT) || 9100;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`WhatsLocal API listening on http://localhost:${port}/api/v1 (CORS: ${origins.join(', ')})`);
}
bootstrap();
