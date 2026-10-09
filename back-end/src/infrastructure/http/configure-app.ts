import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService, seconds } from '@nestjs/throttler';
import helmet from 'helmet';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { configureSwagger } from './configure-swagger';

export const configureApp = async (app: INestApplication): Promise<void> => {
  const config = app.get(ConfigService);

  app.use(helmet());

  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({ origin: corsOrigins });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const guard = new ThrottlerGuard(
    [
      {
        ttl: seconds(config.getOrThrow<number>('RATE_LIMIT_TTL')),
        limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
      },
    ],
    new ThrottlerStorageService(),
    new Reflector(),
  );
  await guard.onModuleInit();
  app.useGlobalGuards(guard);

  configureSwagger(app);
};
