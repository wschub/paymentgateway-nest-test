import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Product } from '../src/domain/entities/product.entity';
import type { MerchantInfo } from '../src/domain/ports/payment-gateway.port';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/infrastructure/http/configure-app';
import {
  PAYMENT_GATEWAY,
  TRANSACTION_REPOSITORY,
} from '../src/infrastructure/modules/injection-tokens';
import { PRODUCTS_REPOSITORY } from '../src/infrastructure/modules/products.module';
import { SystemClock } from '../src/infrastructure/system/system-clock';
import { FakePaymentGateway } from '../src/testing/fake-payment-gateway';
import { InMemoryProductRepository } from '../src/testing/in-memory-product.repository';
import { InMemoryProductStore } from '../src/testing/in-memory-product-store';
import { InMemoryTransactionRepository } from '../src/testing/in-memory-transaction.repository';

const merchantInfo: MerchantInfo = {
  acceptanceToken: 'tok_acceptance_secret',
  personalDataAuthToken: 'tok_personal_data_secret',
  contracts: {
    terms: 'https://contracts.example.test/terms',
    personalData: 'https://contracts.example.test/personal-data',
  },
  installments: { default: 1, max: 12 },
};

const product = new Product({
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Cable Organizer',
  description: 'Keeps cables tidy',
  priceInCents: 1500000,
  stock: 5,
  imageUrl: '/images/products/cable-organizer.webp',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  updatedAt: new Date('2026-10-07T11:00:00.000Z'),
});

const unknownProductId = '00000000-0000-4000-8000-000000000000';

const errorBodyKeys = ['code', 'message', 'path', 'statusCode', 'timestamp'];

const validBody = (overrides: Record<string, unknown> = {}) => ({
  productId: product.id,
  quantity: 1,
  customer: {
    fullName: 'Test Buyer',
    email: 'buyer@example.com',
    phone: '+57 300 000 0000',
  },
  delivery: {
    address: 'Calle 1 #2-3',
    city: 'Bogotá',
    region: 'Cundinamarca',
  },
  ...overrides,
});

describe('POST /transactions (e2e)', () => {
  let app: INestApplication<App>;

  const startApp = async (): Promise<INestApplication<App>> => {
    const store = new InMemoryProductStore([product]);
    const gateway = new FakePaymentGateway(merchantInfo);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .overrideProvider(TRANSACTION_REPOSITORY)
      .useValue(new InMemoryTransactionRepository(new SystemClock(), store))
      .overrideProvider(PRODUCTS_REPOSITORY)
      .useValue(new InMemoryProductRepository(store))
      .compile();

    const instance = moduleRef.createNestApplication();
    await configureApp(instance);
    await instance.init();

    return instance;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('returns 201 with the server-computed amount breakdown', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-ok-0000000001')
      .send(validBody({ quantity: 1 }));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      reference: expect.stringMatching(/^TXN-[A-Z0-9]{16}$/),
      status: 'PENDING',
      quantity: 1,
      amounts: {
        productAmountInCents: 1500000,
        baseFeeInCents: 300000,
        deliveryFeeInCents: 900000,
        totalInCents: 2700000,
      },
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'amounts',
      'id',
      'quantity',
      'reference',
      'status',
    ]);
  });

  it('rejects a body with client-sent amounts with 400', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-tamper-00000001')
      .send(
        validBody({
          amounts: { totalInCents: 1 },
          totalInCents: 1,
        }),
      );

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('rejects a quantity above the maximum with 400', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-quantity-000001')
      .send(validBody({ quantity: 11 }));

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('rejects a missing Idempotency-Key with 400', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .send(validBody());

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('rejects a malformed Idempotency-Key with 400', async () => {
    app = await startApp();

    for (const key of ['short', 'has spaces in it 12']) {
      const response = await request(app.getHttpServer())
        .post('/transactions')
        .set('Idempotency-Key', key)
        .send(validBody());

      expect(response.status).toBe(400);
      expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  });

  it('returns 404 PRODUCT_NOT_FOUND for an unknown product', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-unknown-0000001')
      .send(validBody({ productId: unknownProductId }));

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('returns 409 INSUFFICIENT_STOCK when the quantity exceeds the stock', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-nostock-0000001')
      .send(validBody({ quantity: 6 }));

    expect(response.status).toBe(409);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('makes the reserved stock visible in GET /products', async () => {
    app = await startApp();

    const created = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', 'create-reserve-0000001')
      .send(validBody({ quantity: 2 }));
    expect(created.status).toBe(201);

    const products = await request(app.getHttpServer()).get('/products');

    expect(products.status).toBe(200);
    const stored = products.body.find(
      (item: { id: string }) => item.id === product.id,
    );
    expect(stored).toEqual(
      expect.objectContaining({ id: product.id, stock: 3 }),
    );
  });
});
