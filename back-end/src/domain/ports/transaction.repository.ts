import type { Customer } from '../entities/customer.entity';
import type { Delivery } from '../entities/delivery.entity';
import type { Transaction, TransactionStatus } from '../entities/transaction.entity';

export interface TransactionDetails {
  transaction: Transaction;
  customer: Customer;
  delivery: Delivery;
  product: {
    id: string;
    name: string;
  };
}

export type CreatePendingWithReservedStockResult =
  | { kind: 'created'; transaction: Transaction }
  | { kind: 'out_of_stock' }
  | { kind: 'product_not_found' }
  | { kind: 'duplicate'; transaction: Transaction };

export interface NewCustomerInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface NewDeliveryInput {
  address: string;
  city: string;
  region: string;
  notes: string | null;
}

export interface CreatePendingWithReservedStockInput {
  productId: string;
  reference: string;
  idempotencyKey: string;
  quantity: number;
  productAmountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  customer: NewCustomerInput;
  delivery: NewDeliveryInput;
  now: Date;
}

export interface AttachProviderTransactionInput {
  transactionId: string;
  providerTransactionId: string;
}

export type FinalizeStatus = Exclude<TransactionStatus, 'PENDING'>;

export interface FinalizeInput {
  transactionId: string;
  status: FinalizeStatus;
  providerTransactionId?: string | null;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  installments?: number | null;
  failureReason?: string | null;
}

export interface FinalizeResult {
  finalized: boolean;
  transaction: Transaction;
}

export interface TransactionRepository {
  findById(id: string): Promise<TransactionDetails | null>;
  findByIdempotencyKey(key: string): Promise<TransactionDetails | null>;
  releaseExpiredReservations(now: Date): Promise<number>;
  createPendingWithReservedStock(
    input: CreatePendingWithReservedStockInput,
  ): Promise<CreatePendingWithReservedStockResult>;
  claimPayment(
    transactionId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<boolean>;
  releasePaymentClaim(transactionId: string): Promise<void>;
  attachProviderTransaction(
    input: AttachProviderTransactionInput,
  ): Promise<void>;
  finalize(input: FinalizeInput): Promise<FinalizeResult>;
}