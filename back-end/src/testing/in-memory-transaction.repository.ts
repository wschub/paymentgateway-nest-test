import { Customer } from '../domain/entities/customer.entity';
import { Delivery } from '../domain/entities/delivery.entity';
import {
  Transaction,
  type TransactionProps,
  type TransactionStatus,
} from '../domain/entities/transaction.entity';
import { DataAccessError } from '../domain/errors/data-access.error';
import type { Clock } from '../domain/ports/clock.port';
import type {
  AttachProviderTransactionInput,
  CreatePendingWithReservedStockInput,
  CreatePendingWithReservedStockResult,
  FinalizeInput,
  FinalizeResult,
  TransactionDetails,
  TransactionRepository,
} from '../domain/ports/transaction.repository';

interface SeededProduct {
  name: string;
  stock: number;
}

export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly transactions = new Map<string, Transaction>();
  private readonly customers = new Map<string, Customer>();
  private readonly deliveries = new Map<string, Delivery>();
  private readonly byIdempotencyKey = new Map<string, Transaction>();
  private readonly products: Map<string, SeededProduct>;
  private idCounter = 0;

  constructor(
    private readonly clock: Clock,
    products: ReadonlyMap<string, SeededProduct> = new Map(),
    private readonly reservationTtlSeconds = 900,
  ) {
    this.products = new Map(products);
  }

  async findById(id: string): Promise<TransactionDetails | null> {
    return this.toDetails(this.transactions.get(id));
  }

  async findByIdempotencyKey(key: string): Promise<TransactionDetails | null> {
    return this.toDetails(this.byIdempotencyKey.get(key));
  }

  async releaseExpiredReservations(now: Date): Promise<number> {
    let released = 0;
    for (const transaction of this.transactions.values()) {
      if (
        transaction.status !== 'PENDING' ||
        transaction.paymentStartedAt !== null
      ) {
        continue;
      }
      const expiredAt = transaction.createdAt.getTime() +
        this.reservationTtlSeconds * 1000;
      if (expiredAt >= now.getTime()) {
        continue;
      }
      const voided = transaction.transition({
        status: 'VOIDED',
        at: now,
        failureReason: 'RESERVATION_EXPIRED',
      });
      this.transactions.set(transaction.id, voided);
      this.releaseStock(transaction.productId, transaction.quantity);
      released += 1;
    }
    return released;
  }

  async createPendingWithReservedStock(
    input: CreatePendingWithReservedStockInput,
  ): Promise<CreatePendingWithReservedStockResult> {
    const product = this.products.get(input.productId);
    if (!product) {
      return { kind: 'product_not_found' };
    }
    if (product.stock < input.quantity) {
      return { kind: 'out_of_stock' };
    }
    const existingByKey = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingByKey) {
      return { kind: 'duplicate', transaction: existingByKey };
    }
    const existingByReference = this.findByReference(input.reference);
    if (existingByReference) {
      return { kind: 'duplicate', transaction: existingByReference };
    }

    const id = `tx-${++this.idCounter}`;
    const customer = new Customer({
      id: `customer-${id}`,
      fullName: input.customer.fullName,
      email: input.customer.email,
      phone: input.customer.phone,
    });
    const delivery = new Delivery({
      id: `delivery-${id}`,
      transactionId: id,
      status: 'PENDING',
      address: input.delivery.address,
      city: input.delivery.city,
      region: input.delivery.region,
      notes: input.delivery.notes,
      assignedAt: null,
    });
    const transaction = new Transaction({
      id,
      productId: input.productId,
      customerId: customer.id,
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

    product.stock -= input.quantity;
    this.transactions.set(id, transaction);
    this.customers.set(customer.id, customer);
    this.deliveries.set(id, delivery);
    this.byIdempotencyKey.set(input.idempotencyKey, transaction);
    return { kind: 'created', transaction };
  }

  async claimPayment(
    transactionId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<boolean> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction || transaction.status !== 'PENDING') {
      return false;
    }
    const startedAt = transaction.paymentStartedAt;
    if (startedAt === null) {
      this.transactions.set(transactionId, transaction.claimPayment(now));
      return true;
    }
    if (now.getTime() - startedAt.getTime() > leaseSeconds * 1000) {
      this.transactions.set(transactionId, transaction.claimPayment(now));
      return true;
    }
    return false;
  }

  async releasePaymentClaim(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction || transaction.status !== 'PENDING') {
      return;
    }
    if (transaction.providerTransactionId !== null) {
      return;
    }
    this.transactions.set(
      transactionId,
      this.rebuild(transaction, {
        paymentStartedAt: null,
        updatedAt: this.clock.now(),
      }),
    );
  }

  async attachProviderTransaction(
    input: AttachProviderTransactionInput,
  ): Promise<void> {
    const transaction = this.requireTransaction(input.transactionId);
    this.transactions.set(
      input.transactionId,
      this.rebuild(transaction, {
        providerTransactionId: input.providerTransactionId,
        updatedAt: this.clock.now(),
      }),
    );
  }

  async finalize(input: FinalizeInput): Promise<FinalizeResult> {
    const transaction = this.requireTransaction(input.transactionId);
    if (transaction.status !== 'PENDING') {
      return { finalized: false, transaction };
    }

    const at = this.clock.now();
    const finalized = transaction.transition({
      status: input.status,
      at,
      providerTransactionId: input.providerTransactionId ?? undefined,
      cardBrand: input.cardBrand ?? undefined,
      cardLastFour: input.cardLastFour ?? undefined,
      installments: input.installments ?? undefined,
      failureReason: input.failureReason ?? undefined,
    });
    this.transactions.set(input.transactionId, finalized);

    if (input.status === 'APPROVED') {
      const delivery = this.deliveries.get(input.transactionId);
      if (delivery) {
        this.deliveries.set(input.transactionId, delivery.assign(at));
      }
    } else {
      this.releaseStock(finalized.productId, finalized.quantity);
    }
    return { finalized: true, transaction: finalized };
  }

  private toDetails(transaction: Transaction | undefined): TransactionDetails | null {
    if (!transaction) {
      return null;
    }
    const customer = this.customers.get(transaction.customerId);
    const delivery = this.deliveries.get(transaction.id);
    const product = this.products.get(transaction.productId);
    if (!customer || !delivery || !product) {
      return null;
    }
    return {
      transaction,
      customer,
      delivery,
      product: { id: transaction.productId, name: product.name },
    };
  }

  private requireTransaction(transactionId: string): Transaction {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new DataAccessError(
        `Transaction with id "${transactionId}" was not found`,
      );
    }
    return transaction;
  }

  private findByReference(reference: string): Transaction | undefined {
    for (const transaction of this.transactions.values()) {
      if (transaction.reference === reference) {
        return transaction;
      }
    }
    return undefined;
  }

  private releaseStock(productId: string, quantity: number): void {
    const product = this.products.get(productId);
    if (product) {
      product.stock += quantity;
    }
  }

  private rebuild(
    transaction: Transaction,
    patch: Partial<TransactionProps>,
  ): Transaction {
    return new Transaction({
      id: transaction.id,
      productId: transaction.productId,
      customerId: transaction.customerId,
      reference: transaction.reference,
      idempotencyKey: transaction.idempotencyKey,
      status: transaction.status as TransactionStatus,
      quantity: transaction.quantity,
      productAmountInCents: transaction.productAmountInCents,
      baseFeeInCents: transaction.baseFeeInCents,
      deliveryFeeInCents: transaction.deliveryFeeInCents,
      totalInCents: transaction.totalInCents,
      providerTransactionId: transaction.providerTransactionId,
      installments: transaction.installments,
      cardBrand: transaction.cardBrand,
      cardLastFour: transaction.cardLastFour,
      failureReason: transaction.failureReason,
      paymentStartedAt: transaction.paymentStartedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      ...patch,
    });
  }
}