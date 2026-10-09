import { Test } from '@nestjs/testing';
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
import type { INestApplication } from '@nestjs/common';

describe('Swagger (e2e)', () => {
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

  let app: INestApplication<App>;

  const startApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ProductsModule],
    })
      .overrideProvider(PRODUCTS_REPOSITORY)
      .useValue(new InMemoryProductRepository([mouse]))
      .compile();

    const instance = moduleRef.createNestApplication();
    await configureApp(instance);
    await instance.init();

    return instance;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('serves the Swagger UI at /docs with HTML', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer()).get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  it('exposes the OpenAPI JSON at /docs-json with the product endpoints', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    expect(response.body.info).toEqual(
      expect.objectContaining({ title: 'Payment Gateway API', version: '1.0' }),
    );
    expect(response.body.tags.map((tag: { name: string }) => tag.name)).toContain(
      'products',
    );
    expect(response.body.paths).toHaveProperty('/products');
    expect(response.body.paths).toHaveProperty('/products/{id}');

    const getById = response.body.paths['/products/{id}'].get as {
      parameters: Array<{ name: string }>;
      responses: Record<
        string,
        { content: Record<string, { schema: { $ref: string } }> }
      >;
    };
    expect(getById.parameters[0].name).toBe('id');
    expect(Object.keys(getById.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404']),
    );
    expect(
      getById.responses['400']!.content['application/json'].schema.$ref,
    ).toContain('ErrorResponseDto');
    expect(
      getById.responses['404']!.content['application/json'].schema.$ref,
    ).toContain('ErrorResponseDto');
  });

  it('relaxes the CSP only under the docs routes and keeps the strict Helmet headers elsewhere', async () => {
    app = await startApp();

    const products = await request(app.getHttpServer()).get('/products');
    expect(products.status).toBe(200);
    const strictCsp = products.headers['content-security-policy'];
    expect(strictCsp).toContain("default-src 'self'");
    expect(strictCsp).not.toContain('unsafe-eval');

    const docs = await request(app.getHttpServer()).get('/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
  });
});