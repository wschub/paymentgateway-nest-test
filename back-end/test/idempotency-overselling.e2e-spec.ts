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

const productData = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Cable Organizer',
  description: 'Keeps cables tidy',
  priceInCents: 1500000,
  stock: 5,
  imageUrl: '/images/products/cable-organizer.webp',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  updatedAt: new Date('2026-10-07T11:00:00.000Z'),
};

const product = new Product(productData);

const cardToken = 'tok_test_card_abcdef';
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

describe('Idempotency and overselling (e2e)', () => {
  let app: INestApplication<App>;

  const startApp = async (stock = 5): Promise<INestApplication<App>> => {
    const store = new InMemoryProductStore([{ ...productData, stock }]);
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

  const create = (
    idempotencyKey: string,
    body: Record<string, unknown> = validBody(),
  ) => {
    return request(app.getHttpServer())
      .post('/transactions')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
  };

  const stockOf = async (): Promise<number> => {
    const products = await request(app.getHttpServer()).get('/products');
    const stored = products.body.find(
      (item: { id: string }) => item.id === product.id,
    );
    return stored.stock as number;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('replays a repeated purchase for the same key without reserving stock twice', async () => {
    app = await startApp();

    const first = await create('idem-replay-000001', validBody({ quantity: 2 }));
    expect(first.status).toBe(201);

    const replay = await create('idem-replay-000001', validBody({ quantity: 2 }));

    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.reference).toBe(first.body.reference);
    expect(replay.body).toEqual(first.body);
    expect(await stockOf()).toBe(3);
  });

  it('rejects a reused key whose request differs with 409 IDEMPOTENCY_KEY_REUSED', async () => {
    app = await startApp();

    const first = await create('idem-reuse-0000001', validBody({ quantity: 1 }));
    expect(first.status).toBe(201);

    const reused = await create('idem-reuse-0000001', validBody({ quantity: 2 }));

    expect(reused.status).toBe(409);
    expect(Object.keys(reused.body).sort()).toEqual(errorBodyKeys);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await stockOf()).toBe(4);
  });

  it('never oversells the last unit under concurrent purchases', async () => {
    app = await startApp(1);

    const [a, b] = await Promise.all([
      create('idem-race-00000001', validBody({ quantity: 1 })),
      create('idem-race-00000002', validBody({ quantity: 1 })),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);

    const rejected = a.status === 409 ? a : b;
    expect(rejected.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf()).toBe(0);
  });

  it('returns 409 TRANSACTION_NOT_PAYABLE when paying an already final purchase', async () => {
    app = await startApp();
    const gateway = app.get<FakePaymentGateway>(PAYMENT_GATEWAY);
    gateway.enqueueStatus('APPROVED');

    const created = await create('idem-final-0000001');
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const paid = await request(app.getHttpServer())
      .post(`/transactions/${id}/payment`)
      .send({ cardToken, installments: 1, acceptedContracts: true });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('APPROVED');

    const again = await request(app.getHttpServer())
      .post(`/transactions/${id}/payment`)
      .send({
        cardToken: 'tok_test_new_0009',
        installments: 1,
        acceptedContracts: true,
      });

    expect(again.status).toBe(409);
    expect(Object.keys(again.body).sort()).toEqual(errorBodyKeys);
    expect(again.body.code).toBe('TRANSACTION_NOT_PAYABLE');
  });
});
