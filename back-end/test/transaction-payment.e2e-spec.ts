import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Response } from 'supertest';
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

const unknownTransactionId = '00000000-0000-4000-8000-000000000000';
const cardToken = 'tok_test_card_abcdef';

const FORBIDDEN_SUBSTRINGS = [
  'tok_test_card',
  'tok_acceptance_secret',
  'tok_personal_data_secret',
  'prv_stagtest',
  'stagtest_integrity',
  'stagtest_events',
  '4242424242424242',
];

const errorBodyKeys = ['code', 'message', 'path', 'statusCode', 'timestamp'];

const assertNoSensitiveData = (response: Response): void => {
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(response.text).not.toContain(forbidden);
  }
  expect(response.text).not.toMatch(/\d{13,19}/);
};

describe('POST /transactions/:id/payment (e2e)', () => {
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

  const createPurchase = async (idempotencyKey: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', idempotencyKey)
      .send({
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
      });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const pay = async (
    transactionId: string,
    body: Record<string, unknown> = {},
  ): Promise<Response> => {
    const response = await request(app.getHttpServer())
      .post(`/transactions/${transactionId}/payment`)
      .send({
        cardToken,
        installments: 1,
        acceptedContracts: true,
        ...body,
      });
    assertNoSensitiveData(response);
    return response;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('returns 202 PENDING and creates the provider transaction once', async () => {
    app = await startApp();
    const id = await createPurchase('pay-pending-0000001');
    gateway.enqueueStatus('PENDING');

    const response = await pay(id);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('PENDING');
    expect(
      gateway
        .recordedCalls()
        .filter((call) => call.method === 'createCardTransaction'),
    ).toHaveLength(1);
  });

  it('returns 200 when the provider answers with a final status at creation', async () => {
    app = await startApp();
    const id = await createPurchase('pay-approved-000001');
    gateway.enqueueStatus('APPROVED');

    const response = await pay(id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('APPROVED');
    expect(response.body.card).toEqual({
      brand: 'VISA',
      lastFour: '4242',
      installments: 1,
    });
  });

  it('returns 422 CONTRACTS_NOT_ACCEPTED when the contracts are not accepted', async () => {
    app = await startApp();
    const id = await createPurchase('pay-contracts-0000001');

    const response = await pay(id, { acceptedContracts: false });

    expect(response.status).toBe(422);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('CONTRACTS_NOT_ACCEPTED');
  });

  it('returns 400 when installments exceed the merchant maximum', async () => {
    app = await startApp();
    const id = await createPurchase('pay-install-00000001');

    const response = await pay(id, { installments: 13 });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('returns 404 TRANSACTION_NOT_FOUND for an unknown purchase', async () => {
    app = await startApp();

    const response = await pay(unknownTransactionId);

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('returns 422 for a rejected token and lets a retry with a new token succeed', async () => {
    app = await startApp();
    const id = await createPurchase('pay-token-0000000001');
    gateway.simulateTokenRejected();

    const rejected = await pay(id, { cardToken: 'tok_test_bad_0001' });

    expect(rejected.status).toBe(422);
    expect(Object.keys(rejected.body).sort()).toEqual(errorBodyKeys);
    expect(rejected.body.code).toBe('INVALID_PAYMENT_TOKEN');

    gateway.enqueueStatus('APPROVED');
    const retried = await pay(id, { cardToken: 'tok_test_new_0002' });

    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe('APPROVED');
  });

  it('returns 503 when the provider is unavailable and keeps the claim', async () => {
    app = await startApp();
    const id = await createPurchase('pay-timeout-00000001');
    gateway.simulateTimeout();

    const unavailable = await pay(id);

    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    const retried = await pay(id, { cardToken: 'tok_test_new_0003' });

    expect(retried.status).toBe(202);
    expect(retried.body.status).toBe('PENDING');
    expect(
      gateway
        .recordedCalls()
        .filter((call) => call.method === 'createCardTransaction'),
    ).toHaveLength(1);
  });

  it('returns 409 TRANSACTION_NOT_PAYABLE when the purchase is already final', async () => {
    app = await startApp();
    const id = await createPurchase('pay-final-0000000001');
    gateway.enqueueStatus('APPROVED');

    const approved = await pay(id);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const again = await pay(id, { cardToken: 'tok_test_new_0004' });

    expect(again.status).toBe(409);
    expect(Object.keys(again.body).sort()).toEqual(errorBodyKeys);
    expect(again.body.code).toBe('TRANSACTION_NOT_PAYABLE');
  });
});
