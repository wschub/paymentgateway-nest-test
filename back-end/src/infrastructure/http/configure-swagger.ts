import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';

const DOCS_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

export const configureSwagger = (app: INestApplication): void => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/docs')) {
      res.setHeader('Content-Security-Policy', DOCS_CONTENT_SECURITY_POLICY);
    }
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Payment Gateway API')
    .setVersion('1.0')
    .addTag('products')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};