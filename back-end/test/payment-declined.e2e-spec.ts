import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Response } from 'supertest';
import { Product } from '../src/domain/entities/product.entity';
import type { Clock } from '../src/domain/ports/clock.port';
import type { MerchantInfo } from '../src/domain/ports/payment-gateway.port';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/infrastructure/http/configure-app';
import {
  CLOCK,
  PAYMENT_GATEWAY,
  TRANSACTION_REPOSITORY,
} from '../src/infrastructure/modules/injection-tokens';
import { PRODUCTS_REPOSITORY } from '../src/infrastructure/modules/products.module';
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

const RESERVATION_TTL_SECONDS = 900;

const FORBIDDEN_SUBSTRINGS = [
  'tok_test_card',
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

describe('declined, errored and expired payments (e2e)', () => {
  let app: INestApplication<App>;
  let gateway: FakePaymentGateway;
  let advanceClock: (seconds: number) => void;

  const startApp = async (): Promise<INestApplication<App>> => {
    let current = new Date('2026-10-09T10:00:00.000Z');
    const mutableClock: Clock = { now: () => current };
    advanceClock = (seconds: number): void => {
      current = new Date(current.getTime() + seconds * 1000);
    };

    const store = new InMemoryProductStore([product]);
    gateway = new FakePaymentGateway(merchantInfo);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(mutableClock)
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .overrideProvider(TRANSACTION_REPOSITORY)
      .useValue(new InMemoryTransactionRepository(mutableClock, store))
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

  it('restores the stock and assigns no delivery when the card is declined', async () => {
    app = await startApp();
    const purchase = await createPurchase('declined-0000000001');
    expect(await stockOf()).toBe(3);
    gateway.enqueueStatus('DECLINED', 'Card declined by issuer');

    const response = await pay(purchase.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('DECLINED');
    expect(response.body.failureReason).toBe('Card declined by issuer');
    expect(response.body.delivery.status).toBe('PENDING');
    expect(await stockOf()).toBe(5);
  });

  it('restores the stock and assigns no delivery when the payment ends in error', async () => {
    app = await startApp();
    const purchase = await createPurchase('errored-00000000001');
    expect(await stockOf()).toBe(3);
    gateway.enqueueStatus('ERROR', 'provider error');

    const response = await pay(purchase.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ERROR');
    expect(response.body.failureReason).toBe('provider error');
    expect(response.body.delivery.status).toBe('PENDING');
    expect(await stockOf()).toBe(5);
  });

  it('releases a reservation that never started once past the ttl on GET', async () => {
    app = await startApp();
    const purchase = await createPurchase('expired-00000000001');
    expect(await stockOf()).toBe(3);

    advanceClock(RESERVATION_TTL_SECONDS + 1);
    const released = await getTransaction(purchase.id);

    expect(released.status).toBe(200);
    expect(released.body.status).toBe('VOIDED');
    expect(released.body.failureReason).toBe('RESERVATION_EXPIRED');
    expect(released.body.delivery.status).toBe('PENDING');
    expect(await stockOf()).toBe(5);

    const again = await getTransaction(purchase.id);
    expect(again.body.status).toBe('VOIDED');
    expect(await stockOf()).toBe(5);
  });

  it('keeps the reservation while it is still within the ttl', async () => {
    app = await startApp();
    const purchase = await createPurchase('within-ttl-00000001');
    expect(await stockOf()).toBe(3);

    advanceClock(RESERVATION_TTL_SECONDS - 1);
    const pending = await getTransaction(purchase.id);

    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe('PENDING');
    expect(await stockOf()).toBe(3);
  });
});
