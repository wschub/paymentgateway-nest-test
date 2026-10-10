import type {
  CreateCardTransactionInput,
  PaymentGateway,
} from '../domain/ports/payment-gateway.port';
import type {
  AttachProviderTransactionInput,
  CreatePendingWithReservedStockInput,
  FinalizeInput,
  TransactionRepository,
} from '../domain/ports/transaction.repository';
import type { FakePaymentGateway } from './fake-payment-gateway';
import type { InMemoryTransactionRepository } from './in-memory-transaction.repository';

export const recordingTransactionRepository = (
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

export const recordingPaymentGateway = (
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