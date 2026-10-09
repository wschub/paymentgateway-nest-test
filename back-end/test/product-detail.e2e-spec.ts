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

describe('GET /products/:id (e2e)', () => {
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

  const missingId = '00000000-0000-4000-8000-000000000000';

  const errorBodyKeys = ['code', 'message', 'path', 'statusCode', 'timestamp'];

  let app: INestApplication<App>;

  const startApp = async (repository: InMemoryProductRepository) => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ProductsModule],
    })
      .overrideProvider(PRODUCTS_REPOSITORY)
      .useValue(repository)
      .compile();

    const instance = moduleRef.createNestApplication();
    await configureApp(instance);
    await instance.init();

    return instance;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with the full product object for an existing id', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]));

    const response = await request(app.getHttpServer()).get(
      `/products/${mouse.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: mouse.id,
      name: mouse.name,
      description: mouse.description,
      priceInCents: mouse.priceInCents,
      stock: mouse.stock,
      imageUrl: mouse.imageUrl,
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'description',
      'id',
      'imageUrl',
      'name',
      'priceInCents',
      'stock',
    ]);
  });

  it('returns 404 with exactly the 5-key body for a well-formed unknown id', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]));

    const response = await request(app.getHttpServer()).get(
      `/products/${missingId}`,
    );

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body).toEqual({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: `Product with id "${missingId}" was not found`,
      path: `/products/${missingId}`,
      timestamp: expect.any(String),
    });
  });

  it('returns 400 with exactly the 5-key body for a non-UUID id', async () => {
    app = await startApp(new InMemoryProductRepository([mouse]));

    for (const badId of ['999999', 'abc']) {
      const response = await request(app.getHttpServer()).get(
        `/products/${badId}`,
      );

      expect(response.status).toBe(400);
      expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
      expect(response.body).toEqual({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: expect.any(String),
        path: `/products/${badId}`,
        timestamp: expect.any(String),
      });
    }
  });
});