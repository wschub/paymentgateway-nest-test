import type { Clock } from '../domain/ports/clock.port';
import { InMemoryTransactionRepository } from './in-memory-transaction.repository';

describe('InMemoryTransactionRepository', () => {
  const now = new Date('2026-10-09T10:00:00.000Z');

  const tick = (seconds: number): Date =>
    new Date(now.getTime() + seconds * 1000);

  const clock: Clock = { now: () => now };

  const input = {
    productId: '11111111-1111-4111-8111-111111111111',
    reference: 'TXN-A1B2C3D4E5F6G7H8',
    idempotencyKey: 'order_0001_abcdefgh',
    quantity: 2,
    productAmountInCents: 70000,
    baseFeeInCents: 3000,
    deliveryFeeInCents: 1500,
    totalInCents: 74500,
    customer: {
      fullName: 'Diana Alvarez',
      email: 'diana@example.com',
      phone: '+57 3001234567',
    },
    delivery: {
      address: 'Calle 100 # 20-30',
      city: 'Bogotá',
      region: 'Cundinamarca',
      notes: null,
    },
    now,
  };

  const factory = (
    stock: number,
    productId: string = input.productId,
    ttlSeconds = 900,
  ): InMemoryTransactionRepository =>
    new InMemoryTransactionRepository(
      clock,
      new Map([[productId, { name: 'Wireless Mouse', stock }]]),
      ttlSeconds,
    );

  describe('createPendingWithReservedStock', () => {
    it('reserves stock only when it is sufficient', async () => {
      const repository = factory(5);

      const result = await repository.createPendingWithReservedStock(input);

      expect(result.kind).toBe('created');
      if (result.kind === 'created') {
        expect(result.transaction.status).toBe('PENDING');
        const details = await repository.findById(result.transaction.id);
        expect(details?.product.name).toBe('Wireless Mouse');
      }
    });

    it('fails when the stock is insufficient', async () => {
      const repository = factory(1);

      const result = await repository.createPendingWithReservedStock(input);

      expect(result).toEqual({ kind: 'out_of_stock' });
    });

    it('reports an unknown product', async () => {
      const repository = factory(5, '99999999-9999-4999-8999-999999999999');

      expect(
        await repository.createPendingWithReservedStock(input),
      ).toEqual({ kind: 'product_not_found' });
    });

    it('rejects a reused idempotency key without decrementing stock again', async () => {
      const repository = factory(5);
      const first = await repository.createPendingWithReservedStock(input);
      if (first.kind !== 'created') throw new Error('expected created');

      const second = await repository.createPendingWithReservedStock({
        ...input,
        reference: 'TXN-D2E3F4A5B6C7D8E9',
      });

      expect(second).toEqual({ kind: 'duplicate', transaction: first.transaction });
    });

    it('rejects a reused reference without decrementing stock again', async () => {
      const repository = factory(5);
      const first = await repository.createPendingWithReservedStock(input);
      if (first.kind !== 'created') throw new Error('expected created');

      const second = await repository.createPendingWithReservedStock({
        ...input,
        idempotencyKey: 'another_key_000000',
      });

      expect(second).toEqual({ kind: 'duplicate', transaction: first.transaction });
    });
  });

  describe('claimPayment', () => {
    it('claims the lease only when payment has not started', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');

      expect(
        await repository.claimPayment(created.transaction.id, tick(0), 120),
      ).toBe(true);
      expect(
        await repository.claimPayment(created.transaction.id, tick(10), 120),
      ).toBe(false);
      expect(
        await repository.claimPayment(created.transaction.id, tick(130), 120),
      ).toBe(true);
    });

    it('cannot claim a transaction that is not PENDING', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');
      await repository.finalize({
        transactionId: created.transaction.id,
        status: 'APPROVED',
      });

      expect(
        await repository.claimPayment(created.transaction.id, tick(0), 120),
      ).toBe(false);
    });

    it('returns false for an unknown transaction', async () => {
      const repository = factory(5);

      expect(await repository.claimPayment('unknown', tick(0), 120)).toBe(false);
    });
  });

  describe('finalize', () => {
    it('finalizes exactly once and assigns the delivery on approval', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');

      const first = await repository.finalize({
        transactionId: created.transaction.id,
        status: 'APPROVED',
        providerTransactionId: 'provider-tx-1',
        cardBrand: 'VISA',
        cardLastFour: '4242',
        installments: 3,
      });

      expect(first.finalized).toBe(true);
      if (first.finalized) {
        expect(first.transaction.status).toBe('APPROVED');
        const details = await repository.findById(created.transaction.id);
        expect(details?.delivery.status).toBe('ASSIGNED');
        expect(details?.delivery.assignedAt).toEqual(now);
      }

      const second = await repository.finalize({
        transactionId: created.transaction.id,
        status: 'APPROVED',
      });

      expect(second.finalized).toBe(false);
    });

    it('releases the reserved stock exactly once on a declined finalize', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');

      const first = await repository.finalize({
        transactionId: created.transaction.id,
        status: 'DECLINED',
        failureReason: 'Card rejected',
      });
      const second = await repository.finalize({
        transactionId: created.transaction.id,
        status: 'DECLINED',
      });

      expect(first.finalized).toBe(true);
      expect(second.finalized).toBe(false);
    });
  });

  describe('releaseExpiredReservations', () => {
    it('voids only PENDING, unclaimed reservations older than the TTL', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');

      const afterTtl = new Date(now.getTime() + 901 * 1000);
      const released = await repository.releaseExpiredReservations(afterTtl);

      expect(released).toBe(1);
      const details = await repository.findById(created.transaction.id);
      expect(details?.transaction.status).toBe('VOIDED');
      expect(details?.transaction.failureReason).toBe('RESERVATION_EXPIRED');
    });

    it('leaves a reservation inside the TTL alone', async () => {
      const repository = factory(5);
      await repository.createPendingWithReservedStock(input);

      const released = await repository.releaseExpiredReservations(
        new Date(now.getTime() + 899 * 1000),
      );

      expect(released).toBe(0);
    });

    it('leaves a claimed reservation alone', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');
      await repository.claimPayment(created.transaction.id, tick(0), 120);

      const released = await repository.releaseExpiredReservations(
        new Date(now.getTime() + 3600 * 1000),
      );

      expect(released).toBe(0);
    });
  });

    describe('releasePaymentClaim', () => {
    it('clears the payment claim when no provider transaction id is stored', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');
      await repository.claimPayment(created.transaction.id, tick(0), 120);

      await repository.releasePaymentClaim(created.transaction.id);
      const details = await repository.findById(created.transaction.id);
      expect(details?.transaction.paymentStartedAt).toBeNull();
      expect(await repository.claimPayment(created.transaction.id, tick(5), 120)).toBe(true);
    });

    it('does not clear the claim when a provider transaction id is stored', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');
      await repository.claimPayment(created.transaction.id, tick(0), 120);
      await repository.attachProviderTransaction({
        transactionId: created.transaction.id,
        providerTransactionId: 'provider-tx-7',
      });

      await repository.releasePaymentClaim(created.transaction.id);
      const details = await repository.findById(created.transaction.id);
      expect(details?.transaction.paymentStartedAt).not.toBeNull();
    });

    it('is idempotent for unknown or non-pending transactions', async () => {
      const repository = factory(5);
      await repository.releasePaymentClaim('unknown');
      await repository.releasePaymentClaim('tx-1');
    });
  });

describe('attachProviderTransaction', () => {
    it('records the provider transaction id', async () => {
      const repository = factory(5);
      const created = await repository.createPendingWithReservedStock(input);
      if (created.kind !== 'created') throw new Error('expected created');

      await repository.attachProviderTransaction({
        transactionId: created.transaction.id,
        providerTransactionId: 'provider-tx-9',
      });

      const details = await repository.findById(created.transaction.id);
      expect(details?.transaction.providerTransactionId).toBe('provider-tx-9');
    });
  });
});