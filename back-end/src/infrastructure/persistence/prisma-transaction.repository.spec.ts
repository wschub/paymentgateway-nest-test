import { Prisma } from '@prisma/client';
import { Customer } from '../../domain/entities/customer.entity';
import { Delivery } from '../../domain/entities/delivery.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { Clock } from '../../domain/ports/clock.port';
import type { PrismaService } from './prisma.service';
import { PrismaTransactionRepository } from './prisma-transaction.repository';

const FIXTURE_NOW = new Date('2026-10-09T10:00:00.000Z');
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const DELIVERY_ID = '44444444-4444-4444-8444-444444444444';

const productRow = {
  id: PRODUCT_ID,
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 70000,
  stock: 5,
  imageUrl: '/images/products/wireless-mouse.webp',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  updatedAt: new Date('2026-10-07T11:00:00.000Z'),
};

const customerRow = {
  id: CUSTOMER_ID,
  fullName: 'Diana Alvarez',
  email: 'diana@example.com',
  phone: '+57 300 123 4567',
  createdAt: FIXTURE_NOW,
};

const deliveryRow = {
  id: DELIVERY_ID,
  transactionId: TRANSACTION_ID,
  status: 'PENDING',
  address: 'Calle 100 # 20-30',
  city: 'Bogotá',
  region: 'Cundinamarca',
  postalCode: null,
  notes: null,
  assignedAt: null,
  createdAt: FIXTURE_NOW,
};

const transactionRow = {
  id: TRANSACTION_ID,
  reference: 'TXN-A1B2C3D4E5F6G7H8',
  idempotencyKey: 'order_0001_abcdefgh',
  status: 'PENDING',
  quantity: 2,
  productAmountInCents: 140000,
  baseFeeInCents: 3000,
  deliveryFeeInCents: 1500,
  totalInCents: 144500,
  providerTransactionId: null,
  failureReason: null,
  installments: null,
  cardBrand: null,
  cardLastFour: null,
  paymentStartedAt: null,
  productId: PRODUCT_ID,
  customerId: CUSTOMER_ID,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
};

const transactionRowWithRelations = {
  ...transactionRow,
  customer: customerRow,
  delivery: deliveryRow,
  product: productRow,
};

const createInput = {
  productId: PRODUCT_ID,
  reference: 'TXN-A1B2C3D4E5F6G7H8',
  idempotencyKey: 'order_0001_abcdefgh',
  quantity: 2,
  productAmountInCents: 140000,
  baseFeeInCents: 3000,
  deliveryFeeInCents: 1500,
  totalInCents: 144500,
  customer: {
    fullName: 'Diana Alvarez',
    email: 'diana@example.com',
    phone: '+57 300 123 4567',
  },
  delivery: {
    address: 'Calle 100 # 20-30',
    city: 'Bogotá',
    region: 'Cundinamarca',
    notes: null,
  },
  now: FIXTURE_NOW,
};

interface FakeTx {
  product: { updateMany: jest.Mock; findUnique: jest.Mock };
  customer: { create: jest.Mock };
  transaction: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
  };
  delivery: { create: jest.Mock; updateMany: jest.Mock };
}

const buildPrisma = (): {
  prisma: PrismaService;
  tx: FakeTx;
  $transaction: jest.Mock;
  transactionFindUnique: jest.Mock;
  transactionFindMany: jest.Mock;
} => {
  const tx: FakeTx = {
    product: { updateMany: jest.fn(), findUnique: jest.fn() },
    customer: { create: jest.fn() },
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    delivery: { create: jest.fn(), updateMany: jest.fn() },
  };
  const $transaction = jest.fn(
    async (run: (client: FakeTx) => Promise<unknown>) => run(tx),
  );
  const prisma = {
    ...tx,
    $transaction,
  } as unknown as PrismaService;
  return {
    prisma,
    tx,
    $transaction,
    transactionFindUnique: tx.transaction.findUnique,
    transactionFindMany: tx.transaction.findMany,
  };
};

const clock: Clock = { now: () => FIXTURE_NOW };

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.14.0',
  });

describe('PrismaTransactionRepository', () => {
  describe('findById and findByIdempotencyKey', () => {
    it('returns the aggregate mapped to domain entities', async () => {
      const { prisma, transactionFindUnique } = buildPrisma();
      transactionFindUnique.mockResolvedValue(transactionRowWithRelations);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const details = await repository.findById(TRANSACTION_ID);

      expect(transactionFindUnique).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID },
        include: { customer: true, delivery: true, product: true },
      });
      expect(details).not.toBeNull();
      expect(details?.transaction).toBeInstanceOf(Transaction);
      expect(details?.customer).toBeInstanceOf(Customer);
      expect(details?.delivery).toBeInstanceOf(Delivery);
      expect(details?.product).toEqual({ id: PRODUCT_ID, name: 'Wireless Mouse' });
      expect(details?.transaction.reference).toBe('TXN-A1B2C3D4E5F6G7H8');
      expect(details?.delivery.address).toBe('Calle 100 # 20-30');
      expect(details?.customer.email).toBe('diana@example.com');
    });

    it('finds by idempotency key', async () => {
      const { prisma, transactionFindUnique } = buildPrisma();
      transactionFindUnique.mockResolvedValue(transactionRowWithRelations);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const details = await repository.findByIdempotencyKey('order_0001_abcdefgh');

      expect(transactionFindUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'order_0001_abcdefgh' },
        include: { customer: true, delivery: true, product: true },
      });
      expect(details?.transaction.idempotencyKey).toBe('order_0001_abcdefgh');
    });

    it('returns null when there is no row or no delivery', async () => {
      const { prisma, transactionFindUnique } = buildPrisma();
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      transactionFindUnique.mockResolvedValueOnce(null);
      await expect(repository.findById('unknown')).resolves.toBeNull();

      transactionFindUnique.mockResolvedValueOnce({
        ...transactionRowWithRelations,
        delivery: null,
      });
      await expect(repository.findById(TRANSACTION_ID)).resolves.toBeNull();
    });

    it('wraps provider failures into DataAccessError with a fixed message and cause', async () => {
      const { prisma, transactionFindUnique } = buildPrisma();
      const cause = new Error('P1001 cannot reach database');
      transactionFindUnique.mockRejectedValue(cause);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      try {
        await repository.findById(TRANSACTION_ID);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(DataAccessError);
        expect((error as DataAccessError).message).toBe(
          'Unable to load the transaction',
        );
        expect((error as DataAccessError).cause).toBe(cause);
        expect((error as DataAccessError).message).not.toContain('P1001');
      }
    });
  });

  describe('createPendingWithReservedStock', () => {
    it('decrements the stock conditionally and creates customer, transaction and delivery inside one $transaction', async () => {
      const { prisma, tx, $transaction } = buildPrisma();
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.customer.create.mockResolvedValue(customerRow);
      tx.transaction.create.mockResolvedValue(transactionRow);
      tx.delivery.create.mockResolvedValue(deliveryRow);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.createPendingWithReservedStock(createInput);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(tx.customer.create).toHaveBeenCalledWith({
        data: {
          fullName: 'Diana Alvarez',
          email: 'diana@example.com',
          phone: '+57 300 123 4567',
        },
      });
      expect(tx.transaction.create).toHaveBeenCalledWith({
        data: {
          reference: 'TXN-A1B2C3D4E5F6G7H8',
          idempotencyKey: 'order_0001_abcdefgh',
          status: 'PENDING',
          quantity: 2,
          productAmountInCents: 140000,
          baseFeeInCents: 3000,
          deliveryFeeInCents: 1500,
          totalInCents: 144500,
          productId: PRODUCT_ID,
          customerId: CUSTOMER_ID,
          paymentStartedAt: null,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
      });
      expect(tx.delivery.create).toHaveBeenCalledWith({
        data: {
          transactionId: TRANSACTION_ID,
          status: 'PENDING',
          address: 'Calle 100 # 20-30',
          city: 'Bogotá',
          region: 'Cundinamarca',
          postalCode: null,
          notes: null,
        },
      });
      expect(result.kind).toBe('created');
      if (result.kind === 'created') {
        expect(result.transaction).toBeInstanceOf(Transaction);
        expect(result.transaction.status).toBe('PENDING');
      }
    });

    it('resolves out_of_stock when the conditional decrement updates no rows but the product exists', async () => {
      const { prisma, tx } = buildPrisma();
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      tx.product.findUnique.mockResolvedValue(productRow);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.createPendingWithReservedStock(createInput);

      expect(result).toEqual({ kind: 'out_of_stock' });
      expect(tx.customer.create).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
    });

    it('resolves product_not_found when the product does not exist', async () => {
      const { prisma, tx } = buildPrisma();
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      tx.product.findUnique.mockResolvedValue(null);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.createPendingWithReservedStock(createInput);

      expect(result).toEqual({ kind: 'product_not_found' });
    });

    it('rolls back and resolves duplicate on a P2002 unique violation', async () => {
      const { prisma, tx, transactionFindUnique } = buildPrisma();
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.customer.create.mockResolvedValue(customerRow);
      tx.transaction.create.mockRejectedValue(uniqueViolation());
      transactionFindUnique.mockResolvedValue(transactionRowWithRelations);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const duplicate = await repository.createPendingWithReservedStock(createInput);

      expect(duplicate.kind).toBe('duplicate');
      if (duplicate.kind === 'duplicate') {
        expect(duplicate.transaction).toBeInstanceOf(Transaction);
        expect(duplicate.transaction.id).toBe(TRANSACTION_ID);
      }
      expect(transactionFindUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'order_0001_abcdefgh' },
        include: { customer: true, delivery: true, product: true },
      });
    });

    it('wraps unexpected failures into DataAccessError when the P2002 collision is not the idempotency key', async () => {
      const { prisma, tx, transactionFindUnique } = buildPrisma();
      const cause = uniqueViolation();
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.customer.create.mockResolvedValue(customerRow);
      tx.transaction.create.mockRejectedValue(cause);
      transactionFindUnique.mockResolvedValue(null);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      try {
        await repository.createPendingWithReservedStock(createInput);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(DataAccessError);
        expect((error as DataAccessError).message).toBe(
          'Unable to create the transaction',
        );
        expect((error as DataAccessError).message).not.toContain('P2002');
        expect((error as DataAccessError).cause).toBe(cause);
      }
    });

    it('wraps unexpected failures into DataAccessError without copying the message', async () => {
      const { prisma, tx } = buildPrisma();
      const cause = new Error('P1008 timeout exceeded');
      tx.product.updateMany.mockRejectedValue(cause);
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      try {
        await repository.createPendingWithReservedStock(createInput);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(DataAccessError);
        expect((error as DataAccessError).message).not.toContain('P1008');
        expect((error as DataAccessError).cause).toBe(cause);
      }
    });
  });

  describe('claimPayment', () => {
    it('claims the lease with an exact CAS shape', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);
      const claimAt = new Date('2026-10-09T10:05:00.000Z');

      const claimed = await repository.claimPayment(TRANSACTION_ID, claimAt, 120);

      expect(claimed).toBe(true);
      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: TRANSACTION_ID,
          status: 'PENDING',
          providerTransactionId: null,
          OR: [
            { paymentStartedAt: null },
            {
              paymentStartedAt: {
                lt: new Date(claimAt.getTime() - 120 * 1000),
              },
            },
          ],
        },
        data: { paymentStartedAt: claimAt, updatedAt: FIXTURE_NOW },
      });
    });

    it('returns false when the purchase already has a provider transaction', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 0 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const claimed = await repository.claimPayment(TRANSACTION_ID, FIXTURE_NOW, 120);

      expect(claimed).toBe(false);
      const call = tx.transaction.updateMany.mock.calls[0][0];
      expect(call.where.providerTransactionId).toBeNull();
    });

    it('returns false when no row changes', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 0 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const claimed = await repository.claimPayment(TRANSACTION_ID, FIXTURE_NOW, 120);

      expect(claimed).toBe(false);
    });

    it('wraps prisma failures into DataAccessError', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockRejectedValue(new Error('boom'));
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      await expect(
        repository.claimPayment(TRANSACTION_ID, FIXTURE_NOW, 120),
      ).rejects.toBeInstanceOf(DataAccessError);
    });
  });

  describe('attachProviderTransaction', () => {
    it('sets provider_transaction_id only when it is still null', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      await repository.attachProviderTransaction({
        transactionId: TRANSACTION_ID,
        providerTransactionId: 'provider-tx-1',
      });

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID, providerTransactionId: null },
        data: {
          providerTransactionId: 'provider-tx-1',
          updatedAt: FIXTURE_NOW,
        },
      });
    });
  });

  describe('releasePaymentClaim', () => {
    it('clears payment_started_at only when no provider transaction is stored', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      await repository.releasePaymentClaim(TRANSACTION_ID);

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: TRANSACTION_ID,
          status: 'PENDING',
          providerTransactionId: null,
        },
        data: { paymentStartedAt: null, updatedAt: FIXTURE_NOW },
      });
    });
  });

  describe('finalize', () => {
    it('finalizes exactly once with the delivery assigned on APPROVED', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      tx.transaction.findUnique.mockResolvedValue({
        ...transactionRow,
        status: 'APPROVED',
        cardBrand: 'VISA',
        cardLastFour: '4242',
        installments: 1,
        providerTransactionId: 'provider-tx-1',
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.finalize({
        transactionId: TRANSACTION_ID,
        status: 'APPROVED',
        providerTransactionId: 'provider-tx-1',
        cardBrand: 'VISA',
        cardLastFour: '4242',
        installments: 1,
      });

      expect(result.finalized).toBe(true);
      expect(result.transaction.status).toBe('APPROVED');
      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          providerTransactionId: 'provider-tx-1',
          cardBrand: 'VISA',
          cardLastFour: '4242',
          installments: 1,
          failureReason: undefined,
          updatedAt: FIXTURE_NOW,
        },
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { transactionId: TRANSACTION_ID, status: 'PENDING' },
        data: { status: 'ASSIGNED', assignedAt: FIXTURE_NOW },
      });
    });

    it('releases the stock once on DECLINED and stores the failure reason', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      tx.transaction.findUnique.mockResolvedValue({
        ...transactionRow,
        status: 'DECLINED',
        failureReason: 'Declined by issuer',
      });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.finalize({
        transactionId: TRANSACTION_ID,
        status: 'DECLINED',
        failureReason: 'Declined by issuer',
      });

      expect(result.finalized).toBe(true);
      expect(result.transaction.status).toBe('DECLINED');
      expect(result.transaction.failureReason).toBe('Declined by issuer');
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { stock: { increment: 2 } },
      });
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
    });

    it('answers finalized false and the current transaction when the CAS loses', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockResolvedValue({ count: 0 });
      tx.transaction.findUnique.mockResolvedValue({
        ...transactionRow,
        status: 'APPROVED',
      });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const result = await repository.finalize({
        transactionId: TRANSACTION_ID,
        status: 'APPROVED',
      });

      expect(result.finalized).toBe(false);
      expect(result.transaction.status).toBe('APPROVED');
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('wraps prisma failures into DataAccessError', async () => {
      const { prisma, tx } = buildPrisma();
      tx.transaction.updateMany.mockRejectedValue(new Error('boom'));
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      await expect(
        repository.finalize({ transactionId: TRANSACTION_ID, status: 'APPROVED' }),
      ).rejects.toBeInstanceOf(DataAccessError);
    });
  });

  describe('releaseExpiredReservations', () => {
    it('voids unclaimed reservations older than the TTL with one $transaction each and returns the count', async () => {
      const { prisma, tx, transactionFindMany, $transaction } = buildPrisma();
      transactionFindMany.mockResolvedValue([
        { id: TRANSACTION_ID, productId: PRODUCT_ID, quantity: 2 },
      ]);
      tx.transaction.updateMany.mockResolvedValue({ count: 1 });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);
      const now = new Date(FIXTURE_NOW.getTime() + 1000 * 1000);

      const released = await repository.releaseExpiredReservations(now);

      expect(transactionFindMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          paymentStartedAt: null,
          createdAt: { lt: new Date(now.getTime() - 900 * 1000) },
        },
        select: { id: true, productId: true, quantity: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID, status: 'PENDING', paymentStartedAt: null },
        data: {
          status: 'VOIDED',
          failureReason: 'RESERVATION_EXPIRED',
          updatedAt: now,
        },
      });
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { stock: { increment: 2 } },
      });
      expect(released).toBe(1);
    });

    it('skips a reservation that someone finalizes between the scan and the CAS', async () => {
      const { prisma, tx, transactionFindMany, $transaction } = buildPrisma();
      transactionFindMany.mockResolvedValue([
        { id: TRANSACTION_ID, productId: PRODUCT_ID, quantity: 2 },
      ]);
      tx.transaction.updateMany.mockResolvedValue({ count: 0 });
      const repository = new PrismaTransactionRepository(prisma, clock, 900);

      const released = await repository.releaseExpiredReservations(FIXTURE_NOW);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(released).toBe(0);
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});