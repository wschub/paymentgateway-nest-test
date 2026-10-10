import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  CreateCardTransactionInput,
  MerchantInfo,
  PaymentGateway,
} from '../../domain/ports/payment-gateway.port';
import { FakePaymentGateway } from '../../testing/fake-payment-gateway';
import { InMemoryTransactionRepository } from '../../testing/in-memory-transaction.repository';
import {
  recordingPaymentGateway,
  recordingTransactionRepository,
} from '../../testing/recording-transaction-dependencies';
import { GetTransactionUseCase } from './get-transaction.use-case';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_REFERENCE = 'TXN-A1B2C3D4E5F6G7H8';
const FIXED_NOW = new Date('2026-10-09T10:00:00.000Z');

const merchantInfo: MerchantInfo = {
  publicKey: 'pub_test_public_key',
  baseUrl: 'https://sandbox.invalid/v1',
  currency: 'COP',
  contracts: {
    terms: 'https://example.test/terms',
    personalData: 'https://example.test/privacy',
  },
  installments: { default: 1, max: 12 },
};

const createInput: CreateCardTransactionInput = {
  reference: FIXED_REFERENCE,
  cardToken: 'tok_test_1234',
  amountInCents: 144500,
  currency: 'COP',
  installments: 1,
  customerEmail: 'diana@example.com',
};

const setup = async (): Promise<{
  useCase: GetTransactionUseCase;
  repo: InMemoryTransactionRepository;
  gateway: FakePaymentGateway;
  products: Map<string, { name: string; stock: number }>;
  order: string[];
  transactionId: string;
}> => {
  const order: string[] = [];
  const clock: Clock = { now: () => FIXED_NOW };
  const products = new Map<string, { name: string; stock: number }>([
    [PRODUCT_ID, { name: 'Wireless Mouse', stock: 5 }],
  ]);
  const repo = new InMemoryTransactionRepository(clock, products, 900);
  const gateway = new FakePaymentGateway(merchantInfo);
  const created = await repo.createPendingWithReservedStock({
    productId: PRODUCT_ID,
    reference: FIXED_REFERENCE,
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
    now: FIXED_NOW,
  });
  if (created.kind !== 'created') {
    throw new Error('seeding failed');
  }
  const useCase = new GetTransactionUseCase(
    recordingTransactionRepository(repo, order),
    recordingPaymentGateway(gateway, order),
  );
  return {
    useCase,
    repo,
    gateway,
    products,
    order,
    transactionId: created.transaction.id,
  };
};

const claimWithProviderTransaction = async (
  repo: InMemoryTransactionRepository,
  gateway: FakePaymentGateway,
  transactionId: string,
  status: 'APPROVED' | 'DECLINED' | 'PENDING' | 'UNKNOWN',
  statusMessage: string | null = null,
): Promise<string> => {
  gateway.enqueueStatus(status, statusMessage);
  const stored = await gateway.createCardTransaction(createInput);
  await repo.claimPayment(transactionId, FIXED_NOW, 120);
  await repo.attachProviderTransaction({
    transactionId,
    providerTransactionId: stored.id,
  });
  return stored.id;
};

const claimWithoutProviderTransaction = async (
  repo: InMemoryTransactionRepository,
  gateway: FakePaymentGateway,
  transactionId: string,
  status: 'APPROVED' | 'DECLINED' | 'PENDING' | 'UNKNOWN',
  statusMessage: string | null = null,
): Promise<void> => {
  gateway.enqueueStatus(status, statusMessage);
  await gateway.createCardTransaction(createInput);
  await repo.claimPayment(transactionId, FIXED_NOW, 120);
};

describe('GetTransactionUseCase', () => {
  it('returns TransactionNotFoundError for an unknown id without touching the provider', async () => {
    const { useCase, gateway, order } = await setup();

    const result = await useCase.execute('tx-unknown');

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(TransactionNotFoundError);
    expect(order).toEqual(['findById']);
    expect(gateway.recordedCalls()).toHaveLength(0);
  });

  it('returns the stored view without any provider call when the purchase is already final', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await repo.finalize({ transactionId, status: 'APPROVED' });

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('APPROVED');
      expect(result.value.delivery).toMatchObject({ status: 'ASSIGNED' });
    }
    expect(order).toEqual(['findById']);
    expect(gateway.recordedCalls()).toHaveLength(0);
  });

  it('returns the stored PENDING view without any provider call when the payment was never started', async () => {
    const { useCase, gateway, order, transactionId } = await setup();

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
      expect(result.value.card).toBeNull();
    }
    expect(order).toEqual(['findById']);
    expect(gateway.recordedCalls()).toHaveLength(0);
  });

  it('reads the stored provider transaction and finalizes when it is final', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithProviderTransaction(repo, gateway, transactionId, 'APPROVED');
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('APPROVED');
    expect(result.value.card).toEqual({
      brand: 'VISA',
      lastFour: '4242',
      installments: 1,
    });
    expect(result.value.failureReason).toBeNull();
    expect(result.value.delivery).toMatchObject({ status: 'ASSIGNED' });
    expect(order).toEqual(['findById', 'getTransaction', 'finalize', 'findById']);
  });

  it('stores the provider status message as failureReason when declined', async () => {
    const { useCase, repo, gateway, products, transactionId } = await setup();
    await claimWithProviderTransaction(
      repo,
      gateway,
      transactionId,
      'DECLINED',
      ' Card declined by issuer ',
    );

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('DECLINED');
    expect(result.value.failureReason).toBe('Card declined by issuer');
    expect(result.value.delivery).toMatchObject({ status: 'PENDING' });
    expect(products.get(PRODUCT_ID)?.stock).toBe(5);
  });

  it('keeps the stored view PENDING when the provider status is still not final', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithProviderTransaction(repo, gateway, transactionId, 'PENDING');
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
      expect(result.value.card).toBeNull();
    }
    expect(order).toEqual(['findById', 'getTransaction']);
  });

  it('never finalizes on an unknown provider status', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithProviderTransaction(repo, gateway, transactionId, 'UNKNOWN');

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const details = await repo.findById(transactionId);
    expect(details?.transaction.status).toBe('PENDING');
    expect(order).toEqual(['findById', 'getTransaction']);
  });

  it('returns the stored view when the provider no longer knows the transaction', async () => {
    const { useCase, repo, order, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    await repo.attachProviderTransaction({
      transactionId,
      providerTransactionId: 'provider-gone',
    });
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    expect(order).toEqual(['findById', 'getTransaction']);
  });

  it('reconciles by reference once, adopts the stored transaction and finalizes when final', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithoutProviderTransaction(
      repo,
      gateway,
      transactionId,
      'APPROVED',
    );
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('APPROVED');
    expect(result.value.card).toEqual({
      brand: 'VISA',
      lastFour: '4242',
      installments: 1,
    });
    expect(order).toEqual([
      'findById',
      'findByReference',
      'attachProviderTransaction',
      'finalize',
      'findById',
    ]);
  });

  it('adopts a still-pending reconciliation without finalizing', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithoutProviderTransaction(
      repo,
      gateway,
      transactionId,
      'PENDING',
    );
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const details = await repo.findById(transactionId);
    expect(details?.transaction.providerTransactionId).not.toBeNull();
    expect(details?.transaction.status).toBe('PENDING');
    expect(order).toEqual([
      'findById',
      'findByReference',
      'attachProviderTransaction',
    ]);
  });

  it('returns the stored view when reconciliation finds nothing at the provider', async () => {
    const { useCase, repo, order, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    order.length = 0;

    const result = await useCase.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const details = await repo.findById(transactionId);
    expect(details?.transaction.providerTransactionId).toBeNull();
    expect(order).toEqual(['findById', 'findByReference']);
  });

  it('a provider timeout while reading never fails the request', async () => {
    const { repo, gateway, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    await repo.attachProviderTransaction({
      transactionId,
      providerTransactionId: 'provider-gone',
    });
    const failing: PaymentGateway = {
      getMerchantInfo: () => gateway.getMerchantInfo(),
      createCardTransaction: (input) => gateway.createCardTransaction(input),
      getTransaction: async () => {
        throw new PaymentProviderUnavailableError();
      },
      findByReference: (reference) => gateway.findByReference(reference),
    };
    const useCaseWithFailure = new GetTransactionUseCase(
      recordingTransactionRepository(repo, []),
      failing,
    );

    const result = await useCaseWithFailure.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
  });

  it('a provider rejection during reconciliation never fails the request', async () => {
    const { repo, gateway, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    const failing: PaymentGateway = {
      getMerchantInfo: () => gateway.getMerchantInfo(),
      createCardTransaction: (input) => gateway.createCardTransaction(input),
      getTransaction: (id) => gateway.getTransaction(id),
      findByReference: async () => {
        throw new PaymentProviderRejectedError();
      },
    };
    const useCaseWithFailure = new GetTransactionUseCase(
      recordingTransactionRepository(repo, []),
      failing,
    );

    const result = await useCaseWithFailure.execute(transactionId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
  });

  it('rethrows errors that are not provider failures, untouched', async () => {
    const { repo, gateway, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    await repo.attachProviderTransaction({
      transactionId,
      providerTransactionId: 'provider-gone',
    });
    const exploding: PaymentGateway = {
      getMerchantInfo: () => gateway.getMerchantInfo(),
      createCardTransaction: (input) => gateway.createCardTransaction(input),
      getTransaction: async () => {
        throw new SyntaxError('boom');
      },
      findByReference: (reference) => gateway.findByReference(reference),
    };
    const useCaseWithFailure = new GetTransactionUseCase(
      recordingTransactionRepository(repo, []),
      exploding,
    );

    await expect(useCaseWithFailure.execute(transactionId)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('assigns the delivery exactly once under concurrent executions', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await claimWithProviderTransaction(repo, gateway, transactionId, 'APPROVED');
    order.length = 0;

    const [first, second] = await Promise.all([
      useCase.execute(transactionId),
      useCase.execute(transactionId),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) {
      expect(first.value.status).toBe('APPROVED');
      expect(first.value.delivery).toMatchObject({ status: 'ASSIGNED' });
    }
    if (second.ok) {
      expect(second.value.status).toBe('APPROVED');
    }
    expect(order.filter((entry) => entry === 'finalize')).toHaveLength(2);
    const details = await repo.findById(transactionId);
    expect(details?.delivery.status).toBe('ASSIGNED');
    expect(details?.delivery.assignedAt).toEqual(FIXED_NOW);
  });

  it('releases the stock exactly once under concurrent declines', async () => {
    const { useCase, repo, gateway, products, order, transactionId } =
      await setup();
    await claimWithProviderTransaction(
      repo,
      gateway,
      transactionId,
      'DECLINED',
      'Card declined by issuer',
    );
    order.length = 0;

    const [first, second] = await Promise.all([
      useCase.execute(transactionId),
      useCase.execute(transactionId),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) {
      expect(first.value.status).toBe('DECLINED');
      expect(first.value.failureReason).toBe('Card declined by issuer');
    }
    if (second.ok) {
      expect(second.value.status).toBe('DECLINED');
    }
    expect(order.filter((entry) => entry === 'finalize')).toHaveLength(2);
    expect(products.get(PRODUCT_ID)?.stock).toBe(5);
  });
});