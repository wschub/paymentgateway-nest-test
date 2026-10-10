import type {
  ProviderTransaction,
  ProviderTransactionStatus,
} from '../domain/ports/payment-gateway.port';
import type {
  FinalizeInput,
  FinalizeStatus,
} from '../domain/ports/transaction.repository';

const FINAL_PROVIDER_STATUSES: readonly ProviderTransactionStatus[] = [
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
];

const FAILURE_REASON_MAX_LENGTH = 200;

export const isFinalProviderStatus = (
  status: ProviderTransactionStatus,
): status is FinalizeStatus => FINAL_PROVIDER_STATUSES.includes(status);

const failureReasonFor = (
  providerTransaction: ProviderTransaction,
): string | null | undefined => {
  if (providerTransaction.status === 'APPROVED') {
    return undefined;
  }
  const message = providerTransaction.statusMessage?.trim() ?? '';
  if (message === '') {
    return null;
  }
  return message.slice(0, FAILURE_REASON_MAX_LENGTH);
};

export const buildFinalizeInput = (
  transactionId: string,
  providerTransaction: ProviderTransaction,
): FinalizeInput => ({
  transactionId,
  status: providerTransaction.status as FinalizeStatus,
  providerTransactionId: providerTransaction.id,
  cardBrand: providerTransaction.cardBrand,
  cardLastFour: providerTransaction.cardLastFour,
  installments: providerTransaction.installments,
  failureReason: failureReasonFor(providerTransaction),
});