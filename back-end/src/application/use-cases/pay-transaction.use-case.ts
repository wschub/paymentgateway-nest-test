import { ContractsNotAcceptedError } from '../../domain/errors/contracts-not-accepted.error';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import {
  InvalidTransactionRequestError,
  type InvalidTransactionRequestField,
} from '../../domain/errors/invalid-transaction-request.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { TransactionNotPayableError } from '../../domain/errors/transaction-not-payable.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  PaymentGateway,
  ProviderTransaction,
  ProviderTransactionStatus,
} from '../../domain/ports/payment-gateway.port';
import type {
  FinalizeStatus,
  TransactionDetails,
  TransactionRepository,
} from '../../domain/ports/transaction.repository';
import { isNonEmptyString } from '../../domain/rules/string.rules';
import {
  isValidInstallments,
  MIN_INSTALLMENTS,
} from '../../domain/rules/transaction.rules';
import type { AppConfigValues } from '../config-values';
import { err, ok, type Result } from '../result/result';
import { buildTransactionView, type TransactionView } from '../transaction-view';

export interface PayTransactionInput {
  transactionId: string;
  cardToken: string;
  installments?: number | null;
  acceptedContracts: boolean;
}

export type PayTransactionError =
  | InvalidTransactionRequestError
  | ContractsNotAcceptedError
  | TransactionNotFoundError
  | TransactionNotPayableError
  | InvalidPaymentTokenError
  | PaymentProviderRejectedError
  | PaymentProviderUnavailableError
  | DataAccessError;

const FINAL_PROVIDER_STATUSES: readonly ProviderTransactionStatus[] = [
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
];

const FAILURE_REASON_MAX_LENGTH = 200;

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

export class PayTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly clock: Clock,
    private readonly config: AppConfigValues,
  ) {}

  async execute(
    input: PayTransactionInput,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    try {
      return await this.run(input);
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }
      throw error;
    }
  }

  private async run(
    input: PayTransactionInput,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    const invalidFields = this.validateInput(input);
    if (invalidFields.length > 0) {
      return err(new InvalidTransactionRequestError(invalidFields));
    }
    if (input.acceptedContracts !== true) {
      return err(new ContractsNotAcceptedError());
    }
    const installments = input.installments ?? MIN_INSTALLMENTS;

    const details = await this.transactionRepository.findById(
      input.transactionId,
    );
    if (details === null) {
      return err(new TransactionNotFoundError(input.transactionId));
    }
    if (details.transaction.status !== 'PENDING') {
      return err(
        new TransactionNotPayableError(
          input.transactionId,
          details.transaction.status,
        ),
      );
    }
    if (details.transaction.providerTransactionId !== null) {
      return ok(buildTransactionView(details));
    }

    let merchantInfo;
    try {
      merchantInfo = await this.paymentGateway.getMerchantInfo();
    } catch (error) {
      if (error instanceof PaymentProviderUnavailableError) {
        return err(error);
      }
      throw error;
    }
    if (installments > merchantInfo.installments.max) {
      return err(new InvalidTransactionRequestError(['installments']));
    }

    const claimed = await this.transactionRepository.claimPayment(
      input.transactionId,
      this.clock.now(),
      this.config.paymentClaimLeaseSeconds,
    );
    if (!claimed) {
      return this.respondWhileClaimedByOthers(input.transactionId);
    }

    let providerTransaction = await this.paymentGateway.findByReference(
      details.transaction.reference,
    );
    if (providerTransaction === null) {
      try {
        providerTransaction = await this.paymentGateway.createCardTransaction({
          reference: details.transaction.reference,
          cardToken: input.cardToken,
          amountInCents: details.transaction.totalInCents,
          currency: this.config.currency,
          installments,
          customerEmail: details.customer.email,
        });
      } catch (error) {
        return this.handleCreateFailure(error, input.transactionId);
      }
    }

    return this.continueWithProviderTransaction(details, providerTransaction);
  }

  private async continueWithProviderTransaction(
    details: TransactionDetails,
    providerTransaction: ProviderTransaction,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    await this.transactionRepository.attachProviderTransaction({
      transactionId: details.transaction.id,
      providerTransactionId: providerTransaction.id,
    });

    if (!FINAL_PROVIDER_STATUSES.includes(providerTransaction.status)) {
      const fresh = await this.load(details.transaction.id);
      if (fresh === null) {
        return err(new TransactionNotFoundError(details.transaction.id));
      }
      return ok(buildTransactionView(fresh));
    }

    await this.transactionRepository.finalize({
      transactionId: details.transaction.id,
      status: providerTransaction.status as FinalizeStatus,
      providerTransactionId: providerTransaction.id,
      cardBrand: providerTransaction.cardBrand,
      cardLastFour: providerTransaction.cardLastFour,
      installments: providerTransaction.installments,
      failureReason: failureReasonFor(providerTransaction),
    });

    const refreshed = await this.load(details.transaction.id);
    if (refreshed === null) {
      return err(new TransactionNotFoundError(details.transaction.id));
    }
    return ok(buildTransactionView(refreshed));
  }

  private async handleCreateFailure(
    error: unknown,
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    if (error instanceof InvalidPaymentTokenError) {
      await this.transactionRepository.releasePaymentClaim(transactionId);
      return err(error);
    }
    if (error instanceof PaymentProviderRejectedError) {
      await this.transactionRepository.releasePaymentClaim(transactionId);
      return err(error);
    }
    if (error instanceof PaymentProviderUnavailableError) {
      const adopted = await this.reconcileAfterUnavailable(transactionId);
      if (adopted !== null) {
        return adopted;
      }
      return err(error);
    }
    throw error;
  }

  private async reconcileAfterUnavailable(
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError> | null> {
    const current = await this.load(transactionId);
    if (current === null) {
      return err(new TransactionNotFoundError(transactionId));
    }
    if (current.transaction.providerTransactionId !== null) {
      return ok(buildTransactionView(current));
    }
    const stored = await this.paymentGateway.findByReference(
      current.transaction.reference,
    );
    if (stored === null) {
      return null;
    }
    return this.continueWithProviderTransaction(current, stored);
  }

  private async respondWhileClaimedByOthers(
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    const current = await this.load(transactionId);
    if (current === null) {
      return err(new TransactionNotFoundError(transactionId));
    }
    if (current.transaction.providerTransactionId !== null) {
      return ok(buildTransactionView(current));
    }
    const stored = await this.paymentGateway.findByReference(
      current.transaction.reference,
    );
    if (stored === null) {
      return ok(buildTransactionView(current));
    }
    return this.continueWithProviderTransaction(current, stored);
  }

  private async load(
    transactionId: string,
  ): Promise<TransactionDetails | null> {
    return this.transactionRepository.findById(transactionId);
  }

  private validateInput(
    input: PayTransactionInput,
  ): InvalidTransactionRequestField[] {
    const invalidFields: InvalidTransactionRequestField[] = [];
    if (!isNonEmptyString(input.cardToken)) {
      invalidFields.push('cardToken');
    }
    if (
      input.installments !== undefined &&
      input.installments !== null &&
      !isValidInstallments(input.installments)
    ) {
      invalidFields.push('installments');
    }
    return invalidFields;
  }
}