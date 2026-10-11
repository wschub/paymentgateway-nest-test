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

const FORBIDDEN_SUBSTRINGS = [
  'tok_acceptance_secret',
  'tok_personal_data_secret',
  'prv_stagtest',
  'stagtest_integrity',
  '4242424242424242',
];

const assertNoSensitiveData = (response: Response): void => {
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(response.text).not.toContain(forbidden);
  }
  expect(response.text).not.toMatch(/\d{13,19}/);
};

interface CreatedPurchase {
  id: string;
  reference: string;
}

describe('GET /transactions/:id (e2e)', () => {
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

  const createPurchase = async (
    idempotencyKey: string,
    quantity = 2,
  ): Promise<CreatedPurchase> => {
    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        productId: product.id,
        quantity,
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
    return { id: response.body.id, reference: response.body.reference };
  };

  const pay = async (id: string): Promise<Response> => {
    const response = await request(app.getHttpServer())
      .post(`/transactions/${id}/payment`)
      .send({
        cardToken: 'tok_test_card_abcdef',
        installments: 1,
        acceptedContracts: true,
      });
    assertNoSensitiveData(response);
    return response;
  };

  const getTransaction = async (id: string): Promise<Response> => {
    const response = await request(app.getHttpServer()).get(
      `/transactions/${id}`,
    );
    assertNoSensitiveData(response);
    return response;
  };

  const stockOf = async (): Promise<number> => {
    const response = await request(app.getHttpServer()).get('/products');
    const stored = response.body.find(
      (item: { id: string }) => item.id === product.id,
    );
    return stored.stock as number;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('stays PENDING and then assigns the delivery on approval, keeping stock reserved', async () => {
    app = await startApp();
    const purchase = await createPurchase('status-approved-0001');
    gateway.enqueueStatus('PENDING');
    await pay(purchase.id);

    const pending = await getTransaction(purchase.id);
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe('PENDING');
    expect(pending.body.delivery.status).toBe('PENDING');
    expect(await stockOf()).toBe(3);

    expect(gateway.setStatusByReference(purchase.reference, 'APPROVED')).toBe(
      true,
    );
    const approved = await getTransaction(purchase.id);

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.delivery.status).toBe('ASSIGNED');
    expect(approved.body.failureReason).toBeNull();
    expect(await stockOf()).toBe(3);
  });

  it('releases the stock when the payment is declined', async () => {
    app = await startApp();
    const purchase = await createPurchase('status-declined-0001');
    gateway.enqueueStatus('PENDING');
    await pay(purchase.id);
    expect(await stockOf()).toBe(3);

    gateway.setStatusByReference(purchase.reference, 'DECLINED');
    const declined = await getTransaction(purchase.id);

    expect(declined.body.status).toBe('DECLINED');
    expect(declined.body.delivery.status).toBe('PENDING');
    expect(await stockOf()).toBe(5);
  });

  it('releases the stock when the payment ends in error', async () => {
    app = await startApp();
    const purchase = await createPurchase('status-error-0000001');
    gateway.enqueueStatus('PENDING');
    await pay(purchase.id);
    expect(await stockOf()).toBe(3);

    gateway.setStatusByReference(purchase.reference, 'ERROR', 'provider error');
    const errored = await getTransaction(purchase.id);

    expect(errored.body.status).toBe('ERROR');
    expect(errored.body.delivery.status).toBe('PENDING');
    expect(errored.body.failureReason).toBe('provider error');
    expect(await stockOf()).toBe(5);
  });

  it('recovers the final state on a refresh after a lost payment response', async () => {
    app = await startApp();
    const purchase = await createPurchase('status-recovery-0001');
    gateway.simulateLossAfterCreate('PENDING');

    const paid = await pay(purchase.id);
    expect(paid.status).toBe(202);
    expect(paid.body.status).toBe('PENDING');

    gateway.setStatusByReference(purchase.reference, 'APPROVED');
    const refreshed = await getTransaction(purchase.id);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.status).toBe('APPROVED');
    expect(refreshed.body.delivery.status).toBe('ASSIGNED');
  });

  it('returns 404 TRANSACTION_NOT_FOUND for an unknown purchase id', async () => {
    app = await startApp();

    const response = await getTransaction(
      '00000000-0000-4000-8000-000000000000',
    );

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    expect(response.body.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('never fails on GET while the provider is unavailable', async () => {
    app = await startApp();
    const purchase = await createPurchase('status-unavailable-01');
    gateway.simulateTimeout();

    const paid = await pay(purchase.id);
    expect(paid.status).toBe(503);

    gateway.simulateReadUnavailable();
    const response = await getTransaction(purchase.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PENDING');
  });
});
