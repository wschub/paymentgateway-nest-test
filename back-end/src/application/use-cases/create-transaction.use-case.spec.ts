import { Product } from '../../domain/entities/product.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { IdempotencyReplayNotSupportedError } from '../../domain/errors/idempotency-replay-not-supported.error';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { InvalidTransactionRequestError } from '../../domain/errors/invalid-transaction-request.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import type { Clock } from '../../domain/ports/clock.port';
import type { ProductRepository } from '../../domain/ports/product.repository';
import type {
  CreatePendingWithReservedStockInput,
  TransactionRepository,
} from '../../domain/ports/transaction.repository';
import { FeesConfig } from '../../domain/value-objects/fees-config';
import { InMemoryProductRepository } from '../../testing/in-memory-product.repository';
import { InMemoryProductStore } from '../../testing/in-memory-product-store';
import { InMemoryTransactionRepository } from '../../testing/in-memory-transaction.repository';
import type { AppConfigValues } from '../config-values';
import {
  CreateTransactionUseCase,
  type CreateTransactionInput,
} from './create-transaction.use-case';

const FIXED_REFERENCE = 'TXN-A1B2C3D4E5F6G7H8';
const FIXED_NOW = new Date('2026-10-09T10:00:00.000Z');

const config: AppConfigValues = {
  publicKey: 'pub_test_config_key',
  baseUrl: 'https://pay.example.test/v1',
  currency: 'COP',
  paymentClaimLeaseSeconds: 120,
  reservationTtlSeconds: 900,
};

const product = new Product({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 70000,
  stock: 5,
  imageUrl: '/images/products/wireless-mouse.webp',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  updatedAt: new Date('2026-10-07T11:00:00.000Z'),
});

const feesConfig = new FeesConfig({
  baseFeeInCents: 3000,
  deliveryFeeInCents: 1500,
  currency: 'COP',
});

const clock = { now: (): Date => FIXED_NOW };
const referenceGenerator = { newReference: (): string => FIXED_REFERENCE };

const validInput = (): CreateTransactionInput => ({
  productId: product.id,
  quantity: 2,
  idempotencyKey: 'order_0001_abcdefgh',
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
});

const buildTransaction = (input: CreatePendingWithReservedStockInput): Transaction =>
  new Transaction({
    id: 'tx-captured',
    productId: input.productId,
    customerId: 'customer-captured',
    reference: input.reference,
    idempotencyKey: input.idempotencyKey,
    status: 'PENDING',
    quantity: input.quantity,
    productAmountInCents: input.productAmountInCents,
    baseFeeInCents: input.baseFeeInCents,
    deliveryFeeInCents: input.deliveryFeeInCents,
    totalInCents: input.totalInCents,
    providerTransactionId: null,
    installments: null,
    cardBrand: null,
    cardLastFour: null,
    failureReason: null,
    paymentStartedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });

const recordingRepository = (): TransactionRepository & {
  createInputs: CreatePendingWithReservedStockInput[];
} => {
  const createInputs: CreatePendingWithReservedStockInput[] = [];
  const repository: TransactionRepository = {
    findById: async () => null,
    findByIdempotencyKey: async () => null,
    releaseExpiredReservations: async () => 0,
    createPendingWithReservedStock: async (input) => {
      createInputs.push(input);
      return { kind: 'created', transaction: buildTransaction(input) };
    },
    claimPayment: async () => false,
    releasePaymentClaim: async () => undefined,
    attachProviderTransaction: async () => undefined,
    finalize: async () => {
      throw new Error('finalize is not used in these tests');
    },
  };
  return { ...repository, createInputs };
};

describe('CreateTransactionUseCase', () => {
  const useCaseWith = (
    transactionRepository: TransactionRepository,
    productRepository: ProductRepository = new InMemoryProductRepository([product]),
  ) =>
    new CreateTransactionUseCase(
      productRepository,
      transactionRepository,
      feesConfig,
      clock,
      referenceGenerator,
      config,
    );

  const inMemoryRepository = () =>
    new InMemoryTransactionRepository(
      clock,
      new Map([[product.id, { name: product.name, stock: product.stock }]]),
    );

  describe('validation', () => {
    const assertFieldError = async (
      input: CreateTransactionInput,
      field: string,
    ) => {
      const result = await useCaseWith(inMemoryRepository()).execute(input);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      const error = result.error as InvalidTransactionRequestError;
      expect(error).toBeInstanceOf(InvalidTransactionRequestError);
      expect(error.invalidFields).toContain(field);
    };

    it('rejects an empty productId', async () => {
      await assertFieldError({ ...validInput(), productId: ' ' }, 'productId');
    });

    it('rejects a quantity outside the 1 to 10 range or non-integer', async () => {
      await assertFieldError({ ...validInput(), quantity: 0 }, 'quantity');
      await assertFieldError({ ...validInput(), quantity: 1.5 }, 'quantity');
      await assertFieldError({ ...validInput(), quantity: 11 }, 'quantity');
    });

    it('rejects a long idempotency key', async () => {
      await assertFieldError({ ...validInput(), idempotencyKey: 'a' }, 'idempotencyKey');
    });

    it('rejects an empty or oversized customer fullName', async () => {
      await assertFieldError(
        { ...validInput(), customer: { ...validInput().customer, fullName: '' } },
        'fullName',
      );
      await assertFieldError(
        {
          ...validInput(),
          customer: { ...validInput().customer, fullName: 'a'.repeat(121) },
        },
        'fullName',
      );
    });

    it('rejects an invalid customer email', async () => {
      await assertFieldError(
        { ...validInput(), customer: { ...validInput().customer, email: 'not-an-email' } },
        'email',
      );
    });

    it('rejects an invalid customer phone', async () => {
      await assertFieldError(
        { ...validInput(), customer: { ...validInput().customer, phone: '123' } },
        'phone',
      );
    });

    it('rejects an empty delivery address', async () => {
      await assertFieldError(
        { ...validInput(), delivery: { ...validInput().delivery, address: '' } },
        'address',
      );
    });

    it('rejects an empty delivery city', async () => {
      await assertFieldError(
        { ...validInput(), delivery: { ...validInput().delivery, city: '  ' } },
        'city',
      );
    });

    it('rejects an empty delivery region', async () => {
      await assertFieldError(
        { ...validInput(), delivery: { ...validInput().delivery, region: '' } },
        'region',
      );
    });

    it('rejects oversized delivery notes', async () => {
      await assertFieldError(
        {
          ...validInput(),
          delivery: { ...validInput().delivery, notes: 'x'.repeat(501) },
        },
        'notes',
      );
    });

    it('returns a validation error naming every invalid field and never throws', async () => {
      let productLookups = 0;
      const countingProductRepository: ProductRepository = {
        findAll: async () => [],
        findById: async () => {
          productLookups += 1;
          return product;
        },
      };

      const result = await useCaseWith(
        inMemoryRepository(),
        countingProductRepository,
      ).execute({
        productId: '',
        quantity: 0,
        idempotencyKey: 'bad',
        customer: {
          fullName: '',
          email: 'nope',
          phone: '12',
        },
        delivery: {
          address: '',
          city: '',
          region: '',
          notes: 'x'.repeat(501),
        },
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      const error = result.error as InvalidTransactionRequestError;
      expect(error).toBeInstanceOf(InvalidTransactionRequestError);
      expect(error.invalidFields).toEqual([
        'productId',
        'quantity',
        'idempotencyKey',
        'fullName',
        'email',
        'phone',
        'address',
        'city',
        'region',
        'notes',
      ]);
      expect(error.message).not.toContain('nope');
      expect(productLookups).toBe(0);
    });
  });

  describe('happy path', () => {
    it('returns the server-computed breakdown of the stored purchase', async () => {
      const result = await useCaseWith(inMemoryRepository()).execute(validInput());

      expect(result).toEqual({
        ok: true,
        value: {
          id: 'tx-1',
          reference: FIXED_REFERENCE,
          status: 'PENDING',
          quantity: 2,
          amounts: {
            productAmountInCents: 140000,
            baseFeeInCents: 3000,
            deliveryFeeInCents: 1500,
            totalInCents: 144500,
          },
        },
      });
    });

    it('accepts delivery data without notes', async () => {
      const delivery = { ...validInput().delivery };
      delete delivery.notes;
      const result = await useCaseWith(inMemoryRepository()).execute({
        ...validInput(),
        delivery,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('amount computation', () => {
    it('stores exactly the server-computed amounts, ignoring client-supplied ones', async () => {
      const repository = recordingRepository();
      const tampered = {
        ...validInput(),
        productAmountInCents: 1,
        baseFeeInCents: 0,
        deliveryFeeInCents: 0,
        totalInCents: 1,
        amounts: { productAmountInCents: 1, baseFeeInCents: 0, deliveryFeeInCents: 0, totalInCents: 1 },
      } as CreateTransactionInput;

      const result = await useCaseWith(repository).execute(tampered);

      const stored = repository.createInputs[0];
      expect(stored.productAmountInCents).toBe(140000);
      expect(stored.baseFeeInCents).toBe(3000);
      expect(stored.deliveryFeeInCents).toBe(1500);
      expect(stored.totalInCents).toBe(144500);
      expect(stored.reference).toBe(FIXED_REFERENCE);
      expect(stored.now).toBe(FIXED_NOW);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.amounts).toEqual({
        productAmountInCents: 140000,
        baseFeeInCents: 3000,
        deliveryFeeInCents: 1500,
        totalInCents: 144500,
      });
    });
  });

  describe('product lookup', () => {
    it('returns err(ProductNotFoundError) for an unknown product', async () => {
      const result = await useCaseWith(
        inMemoryRepository(),
        new InMemoryProductRepository([]),
      ).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(ProductNotFoundError);
    });

    it('returns err(DataAccessError) when the product repository fails', async () => {
      const cause = new Error('connection refused');
      const result = await useCaseWith(
        inMemoryRepository(),
        new InMemoryProductRepository([product], cause),
      ).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(DataAccessError);
      expect(result.error.message).toBe('Product repository is unavailable');
      expect(result.error.cause).toBe(cause);
    });

    it('rethrows an error that is not a DataAccessError', async () => {
      const plainError = new Error('socket hang up');
      const failing: ProductRepository = {
        findAll: async () => {
          throw plainError;
        },
        findById: async () => {
          throw plainError;
        },
      };

      await expect(
        useCaseWith(inMemoryRepository(), failing).execute(validInput()),
      ).rejects.toBe(plainError);
    });
  });

  describe('createPendingWithReservedStock variants', () => {
    it('maps out_of_stock to err(InsufficientStockError)', async () => {
      const result = await useCaseWith(
        new InMemoryTransactionRepository(
          clock,
          new Map([[product.id, { name: product.name, stock: 1 }]]),
        ),
      ).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(InsufficientStockError);
      const error = result.error as InsufficientStockError;
      expect(error.productId).toBe(product.id);
      expect(error.requestedQuantity).toBe(2);
      expect(error.availableStock).toBe(product.stock);
    });

    it('maps a repository product_not_found to err(ProductNotFoundError)', async () => {
      const repository = new InMemoryTransactionRepository(
        clock,
        new Map([['99999999-9999-4999-8999-999999999999', { name: 'Other', stock: 5 }]]),
      );

      const result = await useCaseWith(repository).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(ProductNotFoundError);
    });

    it('returns an explicit placeholder error for a duplicate, never leaving it unhandled', async () => {
      const repository = inMemoryRepository();
      await useCaseWith(repository).execute(validInput());

      const result = await useCaseWith(repository).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(IdempotencyReplayNotSupportedError);
    });

    it('converts a DataAccessError thrown by the transaction repository', async () => {
      const cause = new Error('write failed');
      const failing: TransactionRepository = {
        findById: async () => null,
        findByIdempotencyKey: async () => null,
        releaseExpiredReservations: async () => 0,
        createPendingWithReservedStock: async () => {
          throw new DataAccessError('Transaction repository is unavailable', {
            cause,
          });
        },
        claimPayment: async () => false,
        releasePaymentClaim: async () => undefined,
        attachProviderTransaction: async () => undefined,
        finalize: async () => {
          throw new Error('finalize is not used in these tests');
        },
      };

      const result = await useCaseWith(failing).execute(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(DataAccessError);
      expect(result.error.message).toBe('Transaction repository is unavailable');
      expect(result.error.cause).toBe(cause);
    });

    it('rethrows an error that is not a DataAccessError', async () => {
      const plainError = new Error('socket hang up');
      const failing: TransactionRepository = {
        findById: async () => null,
        findByIdempotencyKey: async () => null,
        releaseExpiredReservations: async () => 0,
        createPendingWithReservedStock: async () => {
          throw plainError;
        },
        claimPayment: async () => false,
        releasePaymentClaim: async () => undefined,
        attachProviderTransaction: async () => undefined,
        finalize: async () => {
          throw new Error('finalize is not used in these tests');
        },
      };

    await expect(useCaseWith(failing).execute(validInput())).rejects.toBe(
      plainError,
    );
  });

  describe('reservation expiry sweep', () => {
    const stubRepository = (
      overrides: Partial<TransactionRepository> = {},
    ): TransactionRepository => ({
      findById: async () => null,
      findByIdempotencyKey: async () => null,
      releaseExpiredReservations: async () => 0,
      createPendingWithReservedStock: async (input) => ({
        kind: 'created',
        transaction: buildTransaction(input),
      }),
      claimPayment: async () => false,
      releasePaymentClaim: async () => undefined,
      attachProviderTransaction: async () => undefined,
      finalize: async () => {
        throw new Error('finalize is not used in these tests');
      },
      ...overrides,
    });

    it('sweeps expired reservations with the clock now and the configured ttl before reserving', async () => {
      const sweeps: Array<{ now: Date; ttl: number }> = [];
      let reservedAfterSweep = false;
      const repository = stubRepository({
        releaseExpiredReservations: async (now, ttl) => {
          sweeps.push({ now, ttl });
          return 0;
        },
        createPendingWithReservedStock: async (input) => {
          reservedAfterSweep = sweeps.length === 1;
          return { kind: 'created', transaction: buildTransaction(input) };
        },
      });

      const result = await useCaseWith(repository).execute(validInput());

      expect(sweeps).toEqual([{ now: FIXED_NOW, ttl: 900 }]);
      expect(reservedAfterSweep).toBe(true);
      expect(result.ok).toBe(true);
    });

    it('swallows a DataAccessError raised by the sweep and still creates the purchase', async () => {
      const repository = stubRepository({
        releaseExpiredReservations: async () => {
          throw new DataAccessError('Reservation sweep failed');
        },
      });

      const result = await useCaseWith(repository).execute(validInput());

      expect(result.ok).toBe(true);
    });

    it('rethrows an error that is not a DataAccessError from the sweep', async () => {
      const plainError = new Error('sweep exploded');
      const repository = stubRepository({
        releaseExpiredReservations: async () => {
          throw plainError;
        },
      });

      await expect(useCaseWith(repository).execute(validInput())).rejects.toBe(
        plainError,
      );
    });

    it('reserves the last unit again once an abandoned reservation expires', async () => {
      let current = FIXED_NOW;
      const mutableClock: Clock = { now: () => current };
      const store = new InMemoryProductStore([
        new Product({
          id: product.id,
          name: product.name,
          description: product.description,
          priceInCents: product.priceInCents,
          stock: 1,
          imageUrl: product.imageUrl,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        }),
      ]);
      const repo = new InMemoryTransactionRepository(mutableClock, store);
      let counter = 0;
      const references = {
        newReference: () => `TXN-${String(++counter).padStart(16, '0')}`,
      };
      const useCase = new CreateTransactionUseCase(
        new InMemoryProductRepository([product]),
        repo,
        feesConfig,
        mutableClock,
        references,
        config,
      );

      const first = await useCase.execute({ ...validInput(), quantity: 1 });
      expect(first.ok).toBe(true);
      expect(store.findById(product.id)?.stock).toBe(0);

      current = new Date(current.getTime() + 901 * 1000);
      const second = await useCase.execute({
        ...validInput(),
        quantity: 1,
        idempotencyKey: 'order_0002_abcdefgh',
      });

      expect(second.ok).toBe(true);
      expect(store.findById(product.id)?.stock).toBe(0);
    });
  });
});
});