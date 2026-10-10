import { ContractsNotAcceptedError } from '../../domain/errors/contracts-not-accepted.error';
import { DataAccessError } from '../../domain/errors/data-access.error';
import {
  InvalidTransactionRequestError,
  type InvalidTransactionRequestField,
} from '../../domain/errors/invalid-transaction-request.error';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { TransactionNotPayableError } from '../../domain/errors/transaction-not-payable.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  PaymentGateway,
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
  | DataAccessError;

const FINAL_PROVIDER_STATUSES: readonly ProviderTransactionStatus[] = [
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
];

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

    const merchantInfo = await this.paymentGateway.getMerchantInfo();
    if (installments > merchantInfo.installments.max) {
      return err(new InvalidTransactionRequestError(['installments']));
    }

    const claimed = await this.transactionRepository.claimPayment(
      input.transactionId,
      this.clock.now(),
      this.config.paymentClaimLeaseSeconds,
    );
    if (!claimed) {
      return this.respondWithCurrentView(input.transactionId);
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
          customer: {
            fullName: details.customer.fullName,
            email: details.customer.email,
            phone: details.customer.phone,
          },
        });
      } catch (error) {
        return await this.handleGatewayFailure(error, details.transaction.id);
      }
    }

    await this.transactionRepository.attachProviderTransaction({
      transactionId: details.transaction.id,
      providerTransactionId: providerTransaction.id,
    });

    if (!FINAL_PROVIDER_STATUSES.includes(providerTransaction.status)) {
      return ok(buildTransactionView(details));
    }

    const finalized = await this.transactionRepository.finalize({
      transactionId: details.transaction.id,
      status: providerTransaction.status as FinalizeStatus,
      providerTransactionId: providerTransaction.id,
      cardBrand: providerTransaction.cardBrand,
      cardLastFour: providerTransaction.cardLastFour,
      installments: providerTransaction.installments,
    });
    const refreshed = await this.transactionRepository.findById(
      details.transaction.id,
    );
    return ok(
      buildTransactionView(
        refreshed ?? { ...details, transaction: finalized.transaction },
      ),
    );
  }

  private async respondWithCurrentView(
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    const current = await this.load(transactionId);
    if (current === null) {
      return err(new TransactionNotFoundError(transactionId));
    }
    if (current.transaction.providerTransactionId !== null) {
      return ok(buildTransactionView(current));
    }

    const providerTransaction = await this.paymentGateway.findByReference(
      current.transaction.reference,
    );
    if (providerTransaction === null) {
      return ok(buildTransactionView(current));
    }

    await this.transactionRepository.attachProviderTransaction({
      transactionId: current.transaction.id,
      providerTransactionId: providerTransaction.id,
    });
    const adopted = await this.load(transactionId);
    if (adopted === null) {
      return err(new TransactionNotFoundError(transactionId));
    }
    return ok(buildTransactionView(adopted));
  }

  private async load(
    transactionId: string,
  ): Promise<TransactionDetails | null> {
    return this.transactionRepository.findById(transactionId);
  }

  private async handleGatewayFailure(
    error: unknown,
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError>> {
    if (error instanceof InvalidPaymentTokenError) {
      await this.transactionRepository.releasePaymentClaim(transactionId);
      throw error;
    }
    if (error instanceof PaymentProviderRejectedError) {
      await this.transactionRepository.releasePaymentClaim(transactionId);
      throw error;
    }
    if (error instanceof PaymentProviderUnavailableError) {
      const adopted = await this.tryAdoptFromProvider(transactionId);
      if (adopted !== null) {
        return adopted;
      }
      throw error;
    }
    throw error;
  }

  private async tryAdoptFromProvider(
    transactionId: string,
  ): Promise<Result<TransactionView, PayTransactionError> | null> {
    const current = await this.load(transactionId);
    if (current === null) {
      return null;
    }
    if (current.transaction.providerTransactionId !== null) {
      return ok(buildTransactionView(current));
    }
    const providerTransaction = await this.paymentGateway.findByReference(
      current.transaction.reference,
    );
    if (providerTransaction === null) {
      return null;
    }
    await this.transactionRepository.attachProviderTransaction({
      transactionId: current.transaction.id,
      providerTransactionId: providerTransaction.id,
    });
    const adopted = await this.load(current.transaction.id);
    if (adopted === null) {
      return null;
    }
    if (!FINAL_PROVIDER_STATUSES.includes(providerTransaction.status)) {
      return ok(buildTransactionView(adopted));
    }
    await this.transactionRepository.finalize({
      transactionId: adopted.transaction.id,
      status: providerTransaction.status as FinalizeStatus,
      providerTransactionId: providerTransaction.id,
      cardBrand: providerTransaction.cardBrand,
      cardLastFour: providerTransaction.cardLastFour,
      installments: providerTransaction.installments,
    });
    const refreshed = await this.load(adopted.transaction.id);
    return ok(buildTransactionView(refreshed ?? adopted));
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