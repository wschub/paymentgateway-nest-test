import { ContractsNotAcceptedError } from '../../domain/errors/contracts-not-accepted.error';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import { InvalidTransactionRequestError } from '../../domain/errors/invalid-transaction-request.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { TransactionNotPayableError } from '../../domain/errors/transaction-not-payable.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  CreateCardTransactionInput,
  MerchantInfo,
  PaymentGateway,
} from '../../domain/ports/payment-gateway.port';
import type {
  AttachProviderTransactionInput,
  CreatePendingWithReservedStockInput,
  FinalizeInput,
  TransactionRepository,
} from '../../domain/ports/transaction.repository';
import { FakePaymentGateway } from '../../testing/fake-payment-gateway';
import { InMemoryTransactionRepository } from '../../testing/in-memory-transaction.repository';
import type { AppConfigValues } from '../config-values';
import { PayTransactionUseCase, type PayTransactionInput } from './pay-transaction.use-case';

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

const config: AppConfigValues = {
  publicKey: 'pub_test_config_key',
  baseUrl: 'https://pay.example.test/v1',
  currency: 'COP',
  paymentClaimLeaseSeconds: 120,
};

const providerCreateInput: CreateCardTransactionInput = {
  reference: FIXED_REFERENCE,
  cardToken: 'tok_test_1234',
  amountInCents: 144500,
  currency: 'COP',
  installments: 1,
  customerEmail: 'diana@example.com',
};

const validInput = (
  transactionId: string,
  overrides: Partial<PayTransactionInput> = {},
): PayTransactionInput => ({
  transactionId,
  cardToken: 'tok_test_1234',
  acceptedContracts: true,
  ...overrides,
});

const seedTransaction = async (
  repo: InMemoryTransactionRepository,
  now: Date,
): Promise<string> => {
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
    now,
  });
  if (created.kind !== 'created') {
    throw new Error('seeding failed');
  }
  return created.transaction.id;
};

const recordingRepository = (
  repo: InMemoryTransactionRepository,
  order: string[],
): TransactionRepository => ({
  findById: async (id: string) => {
    order.push('findById');
    return repo.findById(id);
  },
  findByIdempotencyKey: async (key: string) => repo.findByIdempotencyKey(key),
  releaseExpiredReservations: async (now: Date) =>
    repo.releaseExpiredReservations(now),
  createPendingWithReservedStock: async (
    input: CreatePendingWithReservedStockInput,
  ) => repo.createPendingWithReservedStock(input),
  claimPayment: async (id: string, now: Date, leaseSeconds: number) => {
    order.push('claimPayment');
    return repo.claimPayment(id, now, leaseSeconds);
  },
  releasePaymentClaim: async (id: string) => {
    order.push('releasePaymentClaim');
    return repo.releasePaymentClaim(id);
  },
  attachProviderTransaction: async (input: AttachProviderTransactionInput) => {
    order.push('attachProviderTransaction');
    return repo.attachProviderTransaction(input);
  },
  finalize: async (input: FinalizeInput) => {
    order.push('finalize');
    return repo.finalize(input);
  },
});

const recordingGateway = (
  gateway: FakePaymentGateway,
  order: string[],
): PaymentGateway => ({
  getMerchantInfo: async () => {
    order.push('getMerchantInfo');
    return gateway.getMerchantInfo();
  },
  createCardTransaction: async (input: CreateCardTransactionInput) => {
    order.push('createCardTransaction');
    return gateway.createCardTransaction(input);
  },
  getTransaction: async (id: string) => {
    order.push('getTransaction');
    return gateway.getTransaction(id);
  },
  findByReference: async (reference: string) => {
    order.push('findByReference');
    return gateway.findByReference(reference);
  },
});

const setup = async (): Promise<{
  useCase: PayTransactionUseCase;
  repo: InMemoryTransactionRepository;
  gateway: FakePaymentGateway;
  order: string[];
  transactionId: string;
  advance: (milliseconds: number) => void;
}> => {
  const order: string[] = [];
  let current = FIXED_NOW;
  const clock: Clock = { now: () => current };
  const products = new Map<string, { name: string; stock: number }>([
    [PRODUCT_ID, { name: 'Wireless Mouse', stock: 5 }],
  ]);
  const repo = new InMemoryTransactionRepository(clock, products, 900);
  const gateway = new FakePaymentGateway(merchantInfo);
  const transactionId = await seedTransaction(repo, FIXED_NOW);
  const useCase = new PayTransactionUseCase(
    recordingRepository(repo, order),
    recordingGateway(gateway, order),
    clock,
    config,
  );
  return {
    useCase,
    repo,
    gateway,
    order,
    transactionId,
    advance: (milliseconds: number) => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
};

describe('PayTransactionUseCase', () => {
  it('charges the stored amount once and returns the fresh PENDING view', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('PENDING');

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual({
      id: transactionId,
      reference: FIXED_REFERENCE,
      status: 'PENDING',
      quantity: 2,
      amounts: {
        productAmountInCents: 140000,
        baseFeeInCents: 3000,
        deliveryFeeInCents: 1500,
        totalInCents: 144500,
      },
      card: null,
      product: { id: PRODUCT_ID, name: 'Wireless Mouse', quantity: 2 },
      delivery: {
        status: 'PENDING',
        address: 'Calle 100 # 20-30',
        city: 'Bogotá',
        region: 'Cundinamarca',
      },
      failureReason: null,
    });
    expect(Object.keys(result.value).sort()).toEqual([
      'amounts',
      'card',
      'delivery',
      'failureReason',
      'id',
      'product',
      'quantity',
      'reference',
      'status',
    ]);

    const createCall = gateway
      .recordedCalls()
      .find((call) => call.method === 'createCardTransaction');
    expect(createCall?.input).toEqual(providerCreateInput);
  });

  it('never sends the customer name or phone to the provider', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('PENDING');

    await useCase.execute(validInput(transactionId));

    const createCall = gateway
      .recordedCalls()
      .find((call) => call.method === 'createCardTransaction');
    const serialized = JSON.stringify(createCall?.input ?? {});
    expect(serialized).not.toContain('Diana Alvarez');
    expect(serialized).not.toContain('+57 300 123 4567');
  });

  it('reads the merchant info before claiming and reconciles by reference before creating', async () => {
    const { useCase, gateway, order, transactionId } = await setup();
    gateway.enqueueStatus('PENDING');

    await useCase.execute(validInput(transactionId));

    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'attachProviderTransaction',
      'findById',
    ]);
  });

  it('sends the requested installments to the provider', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('PENDING');

    const result = await useCase.execute(
      validInput(transactionId, { installments: 3 }),
    );

    expect(result.ok).toBe(true);
    const createCall = gateway
      .recordedCalls()
      .find((call) => call.method === 'createCardTransaction');
    expect(createCall?.input?.installments).toBe(3);
  });

  it('finalizes through the CAS and keeps failureReason empty when approved', async () => {
    const { useCase, gateway, order, transactionId } = await setup();
    gateway.enqueueStatus('APPROVED');

    const result = await useCase.execute(validInput(transactionId));

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
    expect(order).toContain('finalize');

    const replay = await useCase.execute(validInput(transactionId));
    expect(replay.ok).toBe(false);
    if (replay.ok) {
      return;
    }
    expect(replay.error).toBeInstanceOf(TransactionNotPayableError);
  });

  it('stores the trimmed provider status message as failureReason when declined', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('DECLINED', '  Declined by issuer  ');

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('DECLINED');
    expect(result.value.failureReason).toBe('Declined by issuer');
    expect(result.value.delivery).toMatchObject({ status: 'PENDING' });
  });

  it('truncates a long provider status message to 200 characters', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('ERROR', ` ${'x'.repeat(250)} `);

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('ERROR');
    expect(result.value.failureReason?.length).toBe(200);
  });

  it('stores a null failureReason when the provider adds no message', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.enqueueStatus('DECLINED');

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('DECLINED');
    expect(result.value.failureReason).toBeNull();
  });

  it('rejects when the contracts are not accepted', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, { acceptedContracts: false }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ContractsNotAcceptedError);
    expect(order).toEqual([]);
  });

  it('requires acceptedContracts to be strictly true', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, {
        acceptedContracts: 'true' as unknown as boolean,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ContractsNotAcceptedError);
    expect(order).toEqual([]);
  });

  it('returns TransactionNotFoundError for an unknown id', async () => {
    const { useCase, order } = await setup();

    const result = await useCase.execute(validInput('tx-unknown'));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(TransactionNotFoundError);
    expect(order).toEqual(['findById']);
  });

  it('rejects a purchase that is not PENDING before any provider call', async () => {
    const { useCase, repo, order, transactionId } = await setup();
    await repo.finalize({ transactionId, status: 'APPROVED' });

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(TransactionNotPayableError);
    expect((result.error as TransactionNotPayableError).status).toBe(
      'APPROVED',
    );
    expect(order).toEqual(['findById']);
  });

  it('rejects installments below the minimum without touching the ports', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, { installments: 0 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidTransactionRequestError);
    expect(
      (result.error as InvalidTransactionRequestError).invalidFields,
    ).toEqual(['installments']);
    expect(order).toEqual([]);
  });

  it('rejects non-integer installments', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, { installments: 2.5 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidTransactionRequestError);
    expect(
      (result.error as InvalidTransactionRequestError).invalidFields,
    ).toEqual(['installments']);
    expect(order).toEqual([]);
  });

  it('rejects installments above the merchant maximum after reading the merchant info', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, { installments: 40 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidTransactionRequestError);
    expect(
      (result.error as InvalidTransactionRequestError).invalidFields,
    ).toEqual(['installments']);
    expect(order).toEqual(['findById', 'getMerchantInfo']);
  });

  it('rejects an empty or blank card token without touching the ports', async () => {
    const { useCase, order, transactionId } = await setup();

    const result = await useCase.execute(
      validInput(transactionId, { cardToken: '   ' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidTransactionRequestError);
    expect(
      (result.error as InvalidTransactionRequestError).invalidFields,
    ).toEqual(['cardToken']);
    expect(order).toEqual([]);
  });

  it('makes no second provider call while the lease is active', async () => {
    const { useCase, gateway, order, transactionId } = await setup();
    gateway.enqueueStatus('PENDING');

    const first = await useCase.execute(validInput(transactionId));
    expect(first.ok).toBe(true);

    const replay = await useCase.execute(
      validInput(transactionId, { cardToken: 'tok_test_9999' }),
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.status).toBe('PENDING');
    }

    const creates = gateway
      .recordedCalls()
      .filter((call) => call.method === 'createCardTransaction');
    const references = gateway
      .recordedCalls()
      .filter((call) => call.method === 'findByReference');
    expect(creates).toHaveLength(1);
    expect(references).toHaveLength(1);
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'attachProviderTransaction',
      'findById',
      'findById',
    ]);
  });

  it('returns the current view when the lease is active and nothing was created yet', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    await repo.claimPayment(transactionId, FIXED_NOW, 120);

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const creates = gateway
      .recordedCalls()
      .filter((call) => call.method === 'createCardTransaction');
    expect(creates).toHaveLength(0);
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findById',
      'findByReference',
    ]);
  });

  it('finalizes when the claim was lost but the reconciled transaction is already final', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    gateway.enqueueStatus('APPROVED');
    await gateway.createCardTransaction(providerCreateInput);
    await repo.claimPayment(transactionId, FIXED_NOW, 120);
    order.length = 0;

    const result = await useCase.execute(validInput(transactionId));

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
    expect(result.value.delivery).toMatchObject({ status: 'ASSIGNED' });
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findById',
      'findByReference',
      'attachProviderTransaction',
      'finalize',
      'findById',
    ]);
  });

  it('takes over an expired lease and reconciles by reference before creating', async () => {
    const { useCase, gateway, order, transactionId, advance } = await setup();
    gateway.simulateTimeout();

    const first = await useCase.execute(validInput(transactionId));
    expect(first.ok).toBe(false);
    if (first.ok) {
      return;
    }
    expect(first.error).toBeInstanceOf(PaymentProviderUnavailableError);

    advance(121000);
    gateway.enqueueStatus('PENDING');

    const replay = await useCase.execute(
      validInput(transactionId, { cardToken: 'tok_test_9999' }),
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.status).toBe('PENDING');
    }
    const creates = gateway
      .recordedCalls()
      .filter((call) => call.method === 'createCardTransaction');
    expect(creates).toHaveLength(2);
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'findById',
      'findByReference',
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'attachProviderTransaction',
      'findById',
    ]);
  });

  it('keeps the claim and reconciles once when the provider create times out without a stored transaction', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    gateway.simulateTimeout();

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(PaymentProviderUnavailableError);

    const details = await repo.findById(transactionId);
    expect(details?.transaction.paymentStartedAt).not.toBeNull();

    const references = gateway
      .recordedCalls()
      .filter((call) => call.method === 'findByReference');
    expect(references).toHaveLength(2);
    expect(order).not.toContain('releasePaymentClaim');
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'findById',
      'findByReference',
    ]);
    expect(JSON.stringify(result)).not.toContain('tok_test_1234');
  });

  it('adopts the stored provider transaction when the creation response was lost', async () => {
    const { useCase, gateway, order, transactionId } = await setup();
    gateway.simulateLossAfterCreate('PENDING');

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const creates = gateway
      .recordedCalls()
      .filter((call) => call.method === 'createCardTransaction');
    expect(creates).toHaveLength(1);
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'findById',
      'findByReference',
      'attachProviderTransaction',
      'findById',
    ]);
  });

  it('adopts and finalizes when the lost creation already reached a final status', async () => {
    const { useCase, gateway, transactionId } = await setup();
    gateway.simulateLossAfterCreate('DECLINED', 'Declined by issuer');

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('DECLINED');
    expect(result.value.failureReason).toBe('Declined by issuer');
  });

  it('releases the claim, returns the token error without echoing the token, and the retry succeeds', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    gateway.simulateTokenRejected();

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidPaymentTokenError);
    expect(result.error.message).not.toContain('tok_test_1234');
    expect(JSON.stringify(result)).not.toContain('tok_test_1234');

    const details = await repo.findById(transactionId);
    expect(details?.transaction.paymentStartedAt).toBeNull();
    expect(
      (await repo.findById(transactionId))?.transaction.providerTransactionId,
    ).toBeNull();

    const retry = await useCase.execute(
      validInput(transactionId, { cardToken: 'tok_test_9999' }),
    );

    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.value.status).toBe('APPROVED');
    }
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'releasePaymentClaim',
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'attachProviderTransaction',
      'finalize',
      'findById',
    ]);
  });

  it('releases the claim and returns a generic rejection for other provider 4xx', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    gateway.simulateRejected();

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(PaymentProviderRejectedError);

    const details = await repo.findById(transactionId);
    expect(details?.transaction.paymentStartedAt).toBeNull();
    expect(details?.transaction.providerTransactionId).toBeNull();
    expect(order).toEqual([
      'findById',
      'getMerchantInfo',
      'claimPayment',
      'findByReference',
      'createCardTransaction',
      'releasePaymentClaim',
    ]);
    expect(result.error.message).not.toContain('tok_test_1234');
  });

  it('returns the unavailable error without claiming when the merchant info cannot be read', async () => {
    const { useCase, repo, gateway, order, transactionId } = await setup();
    gateway.simulateMerchantUnavailable();

    const result = await useCase.execute(validInput(transactionId));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(PaymentProviderUnavailableError);

    const details = await repo.findById(transactionId);
    expect(details?.transaction.paymentStartedAt).toBeNull();
    expect(order).toEqual(['findById', 'getMerchantInfo']);
  });

  it('rethrows errors that are not gateway failures, untouched', async () => {
    const { repo, order, transactionId } = await setup();
    const fake = new FakePaymentGateway(merchantInfo);
    const exploding: PaymentGateway = {
      getMerchantInfo: () => fake.getMerchantInfo(),
      createCardTransaction: async () => {
        throw new SyntaxError('boom');
      },
      getTransaction: (id: string) => fake.getTransaction(id),
      findByReference: (reference: string) =>
        fake.findByReference(reference),
    };
    const clock: Clock = { now: () => FIXED_NOW };
    const useCase = new PayTransactionUseCase(
      recordingRepository(repo, order),
      exploding,
      clock,
      config,
    );

    await expect(
      useCase.execute(validInput(transactionId)),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});