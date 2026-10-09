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

describe('GET /products (e2e)', () => {
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

  const soldOutHeadset = new Product({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'USB-C Headset',
    description: 'Noise cancelling headset',
    priceInCents: 99000,
    stock: 0,
    imageUrl: '/images/products/usb-c-headset.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

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

  it('returns 200 with the DTO fields for every product', async () => {
    app = await startApp(new InMemoryProductRepository([mouse, soldOutHeadset]));

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual([
      {
        id: mouse.id,
        name: mouse.name,
        description: mouse.description,
        priceInCents: mouse.priceInCents,
        stock: mouse.stock,
        imageUrl: mouse.imageUrl,
      },
      {
        id: soldOutHeadset.id,
        name: soldOutHeadset.name,
        description: soldOutHeadset.description,
        priceInCents: soldOutHeadset.priceInCents,
        stock: soldOutHeadset.stock,
        imageUrl: soldOutHeadset.imageUrl,
      },
    ]);
    for (const item of response.body) {
      expect(Object.keys(item).sort()).toEqual([
        'description',
        'id',
        'imageUrl',
        'name',
        'priceInCents',
        'stock',
      ]);
    }
  });

  it('returns 200 with an empty array for an empty catalog', async () => {
    app = await startApp(new InMemoryProductRepository([]));

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('still lists a product whose stock is 0', async () => {
    app = await startApp(new InMemoryProductRepository([soldOutHeadset]));

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: soldOutHeadset.id,
        name: soldOutHeadset.name,
        description: soldOutHeadset.description,
        priceInCents: soldOutHeadset.priceInCents,
        stock: soldOutHeadset.stock,
        imageUrl: soldOutHeadset.imageUrl,
      },
    ]);
  });
});