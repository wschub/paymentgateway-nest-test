import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Clock } from '../../src/domain/ports/clock.port';
import type {
  CreatePendingWithReservedStockInput,
  CreatePendingWithReservedStockResult,
  FinalizeResult,
} from '../../src/domain/ports/transaction.repository';
import { PrismaTransactionRepository } from '../../src/infrastructure/persistence/prisma-transaction.repository';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma.service';

// The suite talks to a real PostgreSQL database and is opt-in: it only runs when
// `TEST_DATABASE_URL` points at a database whose name ends with `_test`. It never
// reads `DATABASE_URL`, so the development database is never touched. Both checks
// run before the client is built, so no query is issued against a wrong database.
function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (url === undefined || url === '') {
    throw new Error(
      'TEST_DATABASE_URL must be set to run the integration suite (it must point to a database whose name ends with "_test")',
    );
  }

  let databaseName: string;
  try {
    databaseName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run the integration suite against "${databaseName}": its name must end with "_test"`,
    );
  }

  return url;
}

const testDatabaseUrl = resolveTestDatabaseUrl();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl, max: 20 }),
});
const clock: Clock = { now: () => new Date() };
const repository = new PrismaTransactionRepository(
  prisma as unknown as PrismaService,
  clock,
);

const TABLES = '"deliveries", "transactions", "customers", "products"';

let sequence = 0;
const nextSuffix = (): string => String((sequence += 1)).padStart(6, '0');

function buildCreateInput(
  productId: string,
  overrides: Partial<CreatePendingWithReservedStockInput> = {},
): CreatePendingWithReservedStockInput {
  const quantity = overrides.quantity ?? 1;
  const productAmountInCents = overrides.productAmountInCents ?? 150000 * quantity;
  const baseFeeInCents = overrides.baseFeeInCents ?? 3000;
  const deliveryFeeInCents = overrides.deliveryFeeInCents ?? 1500;
  const suffix = nextSuffix();

  return {
    productId,
    reference: `TXN-${suffix.padStart(16, '0')}`,
    idempotencyKey: `int-key-${suffix.padStart(8, '0')}`,
    quantity,
    productAmountInCents,
    baseFeeInCents,
    deliveryFeeInCents,
    totalInCents: productAmountInCents + baseFeeInCents + deliveryFeeInCents,
    customer: {
      fullName: 'Integration Buyer',
      email: `buyer-${suffix}@example.com`,
      phone: '+57 300 000 0000',
    },
    delivery: {
      address: 'Calle 1 #2-3',
      city: 'Bogotá',
      region: 'Cundinamarca',
      notes: null,
    },
    now: new Date(),
    ...overrides,
  };
}

async function seedProduct(stock: number, priceInCents = 150000): Promise<string> {
  const product = await prisma.product.create({
    data: {
      name: 'Integration Product',
      description: 'Product used by the integration suite',
      priceInCents,
      stock,
      imageUrl: '/images/products/integration.webp',
    },
    select: { id: true },
  });
  return product.id;
}

async function createValidCustomer(): Promise<string> {
  const customer = await prisma.customer.create({
    data: {
      fullName: 'Valid Customer',
      email: `valid-${nextSuffix()}@example.com`,
      phone: '+57 300 000 0000',
    },
    select: { id: true },
  });
  return customer.id;
}

function buildTransactionRow(productId: string, customerId: string) {
  const productAmountInCents = 150000;
  const baseFeeInCents = 3000;
  const deliveryFeeInCents = 1500;
  const suffix = nextSuffix();
  return {
    reference: `TXN-${suffix.padStart(16, '0')}`,
    idempotencyKey: `check-key-${suffix.padStart(6, '0')}`,
    status: 'PENDING' as const,
    quantity: 1,
    productAmountInCents,
    baseFeeInCents,
    deliveryFeeInCents,
    totalInCents: productAmountInCents + baseFeeInCents + deliveryFeeInCents,
    productId,
    customerId,
  };
}

function requireCreatedId(result: CreatePendingWithReservedStockResult): string {
  if (result.kind !== 'created') {
    throw new Error(`expected a created purchase but got "${result.kind}"`);
  }
  return result.transaction.id;
}

async function stockOf(productId: string): Promise<number> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true },
  });
  return product.stock;
}

async function statusSet(transactionId: string) {
  return prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { status: true, failureReason: true },
  });
}

async function deliveryOf(transactionId: string) {
  return prisma.delivery.findUniqueOrThrow({
    where: { transactionId },
    select: { status: true, assignedAt: true },
  });
}

async function paymentStartedAt(transactionId: string): Promise<Date | null> {
  const row = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { paymentStartedAt: true },
  });
  return row.paymentStartedAt;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaTransactionRepository against real PostgreSQL', () => {
  describe('CHECK constraints on the real schema', () => {
    it('accepts a well-formed product and transaction', async () => {
      const productId = await seedProduct(5);
      const customerId = await createValidCustomer();

      const created = await prisma.transaction.create({
        data: buildTransactionRow(productId, customerId),
      });

      expect(created.status).toBe('PENDING');
    });

    it('rejects a product with a negative stock', async () => {
      await expect(
        prisma.product.create({
          data: {
            name: 'Bad product',
            description: 'negative stock',
            priceInCents: 100,
            stock: -1,
            imageUrl: '/images/products/bad.webp',
          },
        }),
      ).rejects.toThrow();
      await expect(prisma.product.count()).resolves.toBe(0);
    });

    it('rejects a product with a non-positive price', async () => {
      await expect(
        prisma.product.create({
          data: {
            name: 'Bad product',
            description: 'zero price',
            priceInCents: 0,
            stock: 1,
            imageUrl: '/images/products/bad.webp',
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a transaction with a non-positive quantity', async () => {
      const productId = await seedProduct(5);
      const customerId = await createValidCustomer();

      await expect(
        prisma.transaction.create({
          data: { ...buildTransactionRow(productId, customerId), quantity: 0 },
        }),
      ).rejects.toThrow();
    });

    it('rejects a transaction whose total does not match its components', async () => {
      const productId = await seedProduct(5);
      const customerId = await createValidCustomer();
      const row = buildTransactionRow(productId, customerId);

      await expect(
        prisma.transaction.create({
          data: { ...row, totalInCents: row.totalInCents + 1 },
        }),
      ).rejects.toThrow();
    });

    it('rejects a transaction with a non-positive installments count', async () => {
      const productId = await seedProduct(5);
      const customerId = await createValidCustomer();

      await expect(
        prisma.transaction.create({
          data: { ...buildTransactionRow(productId, customerId), installments: 0 },
        }),
      ).rejects.toThrow();
    });

    it('rejects a transaction with a non-numeric card_last_four', async () => {
      const productId = await seedProduct(5);
      const customerId = await createValidCustomer();

      await expect(
        prisma.transaction.create({
          data: {
            ...buildTransactionRow(productId, customerId),
            cardLastFour: '12ab',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('createPendingWithReservedStock under real concurrency', () => {
    it('reserves the last unit for exactly one of two concurrent purchases', async () => {
      const productId = await seedProduct(1);

      const results = await Promise.all([
        repository.createPendingWithReservedStock(buildCreateInput(productId)),
        repository.createPendingWithReservedStock(buildCreateInput(productId)),
      ]);

      const kinds = results.map((result) => result.kind).sort();
      expect(kinds).toEqual(['created', 'out_of_stock']);
      await expect(stockOf(productId)).resolves.toBe(0);
      await expect(prisma.transaction.count()).resolves.toBe(1);
    });

    it('never oversells when ten concurrent purchases compete for three units', async () => {
      const productId = await seedProduct(3);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.createPendingWithReservedStock(buildCreateInput(productId)),
        ),
      );

      expect(results.filter((result) => result.kind === 'created')).toHaveLength(3);
      expect(
        results.filter((result) => result.kind === 'out_of_stock'),
      ).toHaveLength(7);
      await expect(stockOf(productId)).resolves.toBe(0);
      await expect(prisma.transaction.count()).resolves.toBe(3);
    });

    it('creates a single purchase when ten concurrent calls share the same idempotency key', async () => {
      const productId = await seedProduct(10);
      const input = buildCreateInput(productId, { quantity: 2 });

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.createPendingWithReservedStock(input),
        ),
      );

      const created = results.filter((result) => result.kind === 'created');
      const duplicates = results.filter((result) => result.kind === 'duplicate');
      expect(created).toHaveLength(1);
      expect(duplicates).toHaveLength(9);

      const ids = new Set(
        results.map((result) =>
          result.kind === 'created'
            ? result.transaction.id
            : result.kind === 'duplicate'
              ? result.details.transaction.id
              : 'unexpected',
        ),
      );
      expect(ids.size).toBe(1);
      await expect(prisma.transaction.count()).resolves.toBe(1);
      await expect(stockOf(productId)).resolves.toBe(8);
    });
  });

  describe('claimPayment under real concurrency', () => {
    it('grants the lease to exactly one of ten concurrent callers', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(buildCreateInput(productId)),
      );
      const now = new Date();

      const claims = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.claimPayment(transactionId, now, 120),
        ),
      );

      expect(claims.filter(Boolean)).toHaveLength(1);
      await expect(paymentStartedAt(transactionId)).resolves.toEqual(now);
    });

    it('grants the lease again to exactly one caller once it has expired', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(buildCreateInput(productId)),
      );
      const firstClaim = new Date();
      await expect(
        repository.claimPayment(transactionId, firstClaim, 120),
      ).resolves.toBe(true);

      const later = new Date(firstClaim.getTime() + 121 * 1000);
      const claims = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.claimPayment(transactionId, later, 120),
        ),
      );

      expect(claims.filter(Boolean)).toHaveLength(1);
      await expect(paymentStartedAt(transactionId)).resolves.toEqual(later);
    });

    it('never grants the lease when a provider transaction is already attached', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(buildCreateInput(productId)),
      );
      const now = new Date();
      await expect(
        repository.claimPayment(transactionId, now, 120),
      ).resolves.toBe(true);
      await repository.attachProviderTransaction({
        transactionId,
        providerTransactionId: 'provider-int-1',
      });

      const later = new Date(now.getTime() + 3600 * 1000);
      await expect(
        repository.claimPayment(transactionId, later, 120),
      ).resolves.toBe(false);
    });
  });

  describe('finalize under real concurrency', () => {
    it('finalizes exactly once and assigns the delivery once for ten concurrent APPROVED', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2 }),
        ),
      );

      const results: FinalizeResult[] = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.finalize({
            transactionId,
            status: 'APPROVED',
            providerTransactionId: 'provider-int-1',
            cardBrand: 'VISA',
            cardLastFour: '4242',
            installments: 1,
          }),
        ),
      );

      expect(results.filter((result) => result.finalized)).toHaveLength(1);
      await expect(statusSet(transactionId)).resolves.toMatchObject({
        status: 'APPROVED',
      });
      const delivery = await deliveryOf(transactionId);
      expect(delivery.status).toBe('ASSIGNED');
      expect(delivery.assignedAt).not.toBeNull();
      await expect(stockOf(productId)).resolves.toBe(3);
    });

    it('restores the stock exactly once for ten concurrent DECLINED', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2 }),
        ),
      );

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          repository.finalize({
            transactionId,
            status: 'DECLINED',
            failureReason: 'Declined by issuer',
          }),
        ),
      );

      expect(results.filter((result) => result.finalized)).toHaveLength(1);
      await expect(statusSet(transactionId)).resolves.toMatchObject({
        status: 'DECLINED',
      });
      await expect(stockOf(productId)).resolves.toBe(5);
      await expect(deliveryOf(transactionId)).resolves.toMatchObject({
        status: 'PENDING',
      });
    });

    it('has a single winner and a consistent end state for a concurrent APPROVED vs DECLINED', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2 }),
        ),
      );

      const [approved, declined] = await Promise.all([
        repository.finalize({
          transactionId,
          status: 'APPROVED',
          providerTransactionId: 'provider-int-1',
          cardBrand: 'VISA',
          cardLastFour: '4242',
          installments: 1,
        }),
        repository.finalize({
          transactionId,
          status: 'DECLINED',
          failureReason: 'Declined by issuer',
        }),
      ]);

      expect(
        [approved.finalized, declined.finalized].filter(Boolean),
      ).toHaveLength(1);

      const { status } = await statusSet(transactionId);
      const delivery = await deliveryOf(transactionId);
      const stock = await stockOf(productId);

      if (status === 'APPROVED') {
        expect(approved.finalized).toBe(true);
        expect(delivery.status).toBe('ASSIGNED');
        expect(stock).toBe(3);
      } else {
        expect(status).toBe('DECLINED');
        expect(declined.finalized).toBe(true);
        expect(delivery.status).toBe('PENDING');
        expect(stock).toBe(5);
      }
    });
  });

  describe('releaseExpiredReservations', () => {
    const ttlSeconds = 900;

    it('voids an unpaid reservation older than the ttl and restores its stock', async () => {
      const productId = await seedProduct(5);
      const stale = new Date(Date.now() - (ttlSeconds + 60) * 1000);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2, now: stale }),
        ),
      );
      await expect(stockOf(productId)).resolves.toBe(3);

      const released = await repository.releaseExpiredReservations(
        new Date(),
        ttlSeconds,
      );

      expect(released).toBe(1);
      await expect(statusSet(transactionId)).resolves.toMatchObject({
        status: 'VOIDED',
        failureReason: 'RESERVATION_EXPIRED',
      });
      await expect(stockOf(productId)).resolves.toBe(5);
    });

    it('never releases a reservation whose payment already started', async () => {
      const productId = await seedProduct(5);
      const stale = new Date(Date.now() - (ttlSeconds + 60) * 1000);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2, now: stale }),
        ),
      );
      await expect(
        repository.claimPayment(transactionId, stale, 120),
      ).resolves.toBe(true);

      const released = await repository.releaseExpiredReservations(
        new Date(),
        ttlSeconds,
      );

      expect(released).toBe(0);
      await expect(statusSet(transactionId)).resolves.toMatchObject({
        status: 'PENDING',
      });
      await expect(stockOf(productId)).resolves.toBe(3);
    });

    it('releases a reservation exactly once when run twice concurrently', async () => {
      const productId = await seedProduct(5);
      const stale = new Date(Date.now() - (ttlSeconds + 60) * 1000);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(
          buildCreateInput(productId, { quantity: 2, now: stale }),
        ),
      );

      const [first, second] = await Promise.all([
        repository.releaseExpiredReservations(new Date(), ttlSeconds),
        repository.releaseExpiredReservations(new Date(), ttlSeconds),
      ]);

      expect(first + second).toBe(1);
      await expect(statusSet(transactionId)).resolves.toMatchObject({
        status: 'VOIDED',
      });
      await expect(stockOf(productId)).resolves.toBe(5);
    });
  });

  describe('releasePaymentClaim', () => {
    it('clears the claim when no provider transaction is stored', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(buildCreateInput(productId)),
      );
      const now = new Date();
      await expect(
        repository.claimPayment(transactionId, now, 120),
      ).resolves.toBe(true);

      await repository.releasePaymentClaim(transactionId);

      await expect(paymentStartedAt(transactionId)).resolves.toBeNull();
    });

    it('keeps the claim when a provider transaction is stored', async () => {
      const productId = await seedProduct(5);
      const transactionId = requireCreatedId(
        await repository.createPendingWithReservedStock(buildCreateInput(productId)),
      );
      const now = new Date();
      await expect(
        repository.claimPayment(transactionId, now, 120),
      ).resolves.toBe(true);
      await repository.attachProviderTransaction({
        transactionId,
        providerTransactionId: 'provider-int-1',
      });

      await repository.releasePaymentClaim(transactionId);

      await expect(paymentStartedAt(transactionId)).resolves.not.toBeNull();
    });
  });
});
