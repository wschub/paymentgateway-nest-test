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

const FORBIDDEN_SUBSTRINGS = [
  'prv_stagtest',
  'stagtest_integrity',
  'stagtest_events',
  'tok_acceptance_secret',
  'tok_personal_data_secret',
];

describe('GET /payments/checkout-config (e2e)', () => {
  let app: INestApplication<App>;
  let gateway: FakePaymentGateway;

  const startApp = async (): Promise<INestApplication<App>> => {
    const store = new InMemoryProductStore([product]);
    gateway = new FakePaymentGateway(merchantInfo);

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

  it('returns 200 with the public configuration only', async () => {
    app = await startApp();

    const response = await request(app.getHttpServer()).get(
      '/payments/checkout-config',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      publicKey: 'pub_stagtest_test_placeholder',
      baseUrl: 'https://sandbox.invalid/v1',
      currency: 'COP',
      contracts: {
        terms: 'https://contracts.example.test/terms',
        personalData: 'https://contracts.example.test/personal-data',
      },
      installments: { default: 1, max: 12 },
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'baseUrl',
      'contracts',
      'currency',
      'installments',
      'publicKey',
    ]);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(response.text).not.toContain(forbidden);
    }
  });

  it('returns 503 PAYMENT_PROVIDER_UNAVAILABLE when the merchant info cannot be read', async () => {
    app = await startApp();
    gateway.simulateMerchantUnavailable();

    const response = await request(app.getHttpServer()).get(
      '/payments/checkout-config',
    );

    expect(response.status).toBe(503);
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    expect(response.body).toEqual({
      statusCode: 503,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      message: 'The payment provider is temporarily unavailable',
      path: '/payments/checkout-config',
      timestamp: expect.any(String),
    });
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(response.text).not.toContain(forbidden);
    }
  });
});
