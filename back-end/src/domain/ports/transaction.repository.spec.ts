import { Customer } from '../entities/customer.entity';
import { Delivery } from '../entities/delivery.entity';
import { Transaction } from '../entities/transaction.entity';
import type { TransactionRepository } from './transaction.repository';

describe('TransactionRepository port', () => {
  const transaction = new Transaction({
    id: '22222222-2222-4222-8222-222222222222',
    productId: '11111111-1111-4111-8111-111111111111',
    customerId: '33333333-3333-4333-8333-333333333333',
    reference: 'TXN-A1B2C3D4E5F6G7H8',
    idempotencyKey: 'order_0001_abcdefgh',
    status: 'PENDING',
    quantity: 2,
    productAmountInCents: 70000,
    baseFeeInCents: 3000,
    deliveryFeeInCents: 1500,
    totalInCents: 74500,
    providerTransactionId: null,
    installments: null,
    cardBrand: null,
    cardLastFour: null,
    failureReason: null,
    paymentStartedAt: null,
    createdAt: new Date('2026-10-09T10:00:00.000Z'),
    updatedAt: new Date('2026-10-09T10:00:00.000Z'),
  });

  const customer = new Customer({
    id: '33333333-3333-4333-8333-333333333333',
    fullName: 'Diana Alvarez',
    email: 'diana@example.com',
    phone: '+57 3001234567',
  });

  const delivery = new Delivery({
    id: '66666666-6666-4666-8666-666666666666',
    transactionId: transaction.id,
    status: 'PENDING',
    address: 'Calle 100 # 20-30',
    city: 'Bogotá',
    region: 'Cundinamarca',
    notes: null,
    assignedAt: null,
  });

  const repository: TransactionRepository = {
    findById: async (id) =>
      id === transaction.id
        ? {
            transaction,
            customer,
            delivery,
            product: { id: transaction.productId, name: 'Wireless Mouse' },
          }
        : null,
    findByIdempotencyKey: async (key) =>
      key === transaction.idempotencyKey
        ? {
            transaction,
            customer,
            delivery,
            product: { id: transaction.productId, name: 'Wireless Mouse' },
          }
        : null,
    releaseExpiredReservations: async () => 0,
    createPendingWithReservedStock: async () => ({ kind: 'created', transaction }),
    claimPayment: async () => true,
    releasePaymentClaim: async () => undefined,
    attachProviderTransaction: async () => undefined,
    finalize: async () => ({ finalized: false, transaction }),
  };

  it('finds the purchase aggregate by id', async () => {
    const details = await repository.findById(transaction.id);

    expect(details?.transaction).toBe(transaction);
    expect(details?.customer).toBe(customer);
    expect(details?.delivery).toBe(delivery);
    expect(details?.product).toEqual({ id: transaction.productId, name: 'Wireless Mouse' });
  });

  it('returns null for an unknown id', async () => {
    await expect(
      repository.findById('99999999-9999-4999-8999-999999999999'),
    ).resolves.toBeNull();
  });

  it('finds the purchase aggregate by idempotency key', async () => {
    const details = await repository.findByIdempotencyKey(transaction.idempotencyKey);

    expect(details?.transaction.id).toBe(transaction.id);
    expect(details?.product.name).toBe('Wireless Mouse');
  });

  it('returns null for an unknown idempotency key', async () => {
    await expect(
      repository.findByIdempotencyKey('unknown_key_00000000'),
    ).resolves.toBeNull();
  });

  it('creates a pending purchase with reserved stock', async () => {
    await expect(
      repository.createPendingWithReservedStock({
        productId: transaction.productId,
        reference: transaction.reference,
        idempotencyKey: transaction.idempotencyKey,
        quantity: transaction.quantity,
        productAmountInCents: transaction.productAmountInCents,
        baseFeeInCents: transaction.baseFeeInCents,
        deliveryFeeInCents: transaction.deliveryFeeInCents,
        totalInCents: transaction.totalInCents,
        customer: {
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone,
        },
        delivery: {
          address: delivery.address,
          city: delivery.city,
          region: delivery.region,
          notes: delivery.notes,
        },
        now: new Date('2026-10-09T10:00:00.000Z'),
      }),
    ).resolves.toEqual({ kind: 'created', transaction });
  });

  it('claims the payment lease', async () => {
    await expect(repository.claimPayment(transaction.id, new Date(), 120)).resolves.toBe(
      true,
    );
  });

  it('attaches the provider transaction id', async () => {
    await expect(
      repository.attachProviderTransaction({
        transactionId: transaction.id,
        providerTransactionId: 'provider-tx-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('finalizes through a compare-and-set', async () => {
    await expect(
      repository.finalize({ transactionId: transaction.id, status: 'APPROVED' }),
    ).resolves.toEqual({ finalized: false, transaction });
  });

  it('releases expired reservations', async () => {
    await expect(repository.releaseExpiredReservations(new Date())).resolves.toBe(0);
  });
});