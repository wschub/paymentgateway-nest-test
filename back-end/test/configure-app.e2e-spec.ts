import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/infrastructure/http/configure-app';

describe('configureApp', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await configureApp(app);
    await app.init();

    expect(app.get(ConfigService)).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with the five key error body', async () => {
    const response = await request(app.getHttpServer()).get('/not-a-route');

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    expect(response.body.statusCode).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.path).toBe('/not-a-route');
    expect(response.body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('sets the Helmet security headers and hides the technology', async () => {
    const response = await request(app.getHttpServer()).get('/not-a-route');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
