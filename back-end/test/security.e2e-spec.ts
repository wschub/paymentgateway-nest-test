import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Product } from '../src/domain/entities/product.entity';
import { AppConfigModule } from '../src/infrastructure/config/config.module';
import { configureApp } from '../src/infrastructure/http/configure-app';
import {
  PRODUCTS_REPOSITORY,
  ProductsModule,
} from '../src/infrastructure/modules/products.module';
import { InMemoryProductRepository } from '../src/testing/in-memory-product.repository';

describe('Security (e2e)', () => {
  const mouse = new Product({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 35000,
    stock: 15,
    imageUrl: '/images/products/wireless-mouse.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const allowedOrigin = 'http://localhost:5173';
  const errorBodyKeys = ['code', 'message', 'path', 'statusCode', 'timestamp'];

  let app: INestApplication<App>;

  const startApp = async (
    repository: InMemoryProductRepository,
    lowRateLimit?: boolean,
  ) => {
    let builder = Test.createTestingModule({
      imports: [AppConfigModule, ProductsModule],
    }).overrideProvider(PRODUCTS_REPOSITORY).useValue(repository);

    if (lowRateLimit) {
      builder = builder.overrideProvider(ConfigService).useValue({
        getOrThrow: (key: string) =>
          ({
            CORS_ORIGINS: allowedOrigin,
            RATE_LIMIT_TTL: 60,
            RATE_LIMIT_MAX: 2,
          })[key],
      });
    }

    const moduleRef = await builder.compile();

    const instance = moduleRef.createNestApplication();
    await configureApp(instance);
    await instance.init();

    return instance;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('sends the Helmet security headers and hides x-powered-by', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]));

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
  });

  it('allows an origin from CORS_ORIGINS and rejects a different one', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]));

    const allowed = await request(app.getHttpServer())
      .get('/products')
      .set('Origin', allowedOrigin);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);

    const rejected = await request(app.getHttpServer())
      .get('/products')
      .set('Origin', 'http://evil.example.com');
    expect(rejected.status).toBe(200);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns 429 with the 5-key body and a Retry-After header when the rate limit is exceeded', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]), true);

    const first = await request(app.getHttpServer()).get('/products');
    const second = await request(app.getHttpServer()).get('/products');
    const exceeded = await request(app.getHttpServer()).get('/products');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(exceeded.status).toBe(429);
    expect(Object.keys(exceeded.body).sort()).toEqual(errorBodyKeys);
    expect(exceeded.body).toEqual({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
      path: '/products',
      timestamp: expect.any(String),
    });
    expect(Number(exceeded.headers['retry-after'])).toBeGreaterThan(0);
  });
});