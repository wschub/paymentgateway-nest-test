import type { Transaction } from '../../domain/entities/transaction.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  PaymentGateway,
  ProviderTransaction,
} from '../../domain/ports/payment-gateway.port';
import type { TransactionRepository } from '../../domain/ports/transaction.repository';
import type { AppConfigValues } from '../config-values';
import {
  buildFinalizeInput,
  isFinalProviderStatus,
} from '../finalize-input';
import { err, ok, type Result } from '../result/result';
import { buildTransactionView, type TransactionView } from '../transaction-view';

export type GetTransactionError = TransactionNotFoundError | DataAccessError;

export class GetTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly clock: Clock,
    private readonly config: AppConfigValues,
  ) {}

  async execute(
    transactionId: string,
  ): Promise<Result<TransactionView, GetTransactionError>> {
    try {
      return await this.run(transactionId);
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }
      throw error;
    }
  }

  private async run(
    transactionId: string,
  ): Promise<Result<TransactionView, GetTransactionError>> {
    const found = await this.transactionRepository.findById(transactionId);
    if (found === null) {
      return err(new TransactionNotFoundError(transactionId));
    }

    let details = found;
    if (this.isExpiredUnstartedReservation(details.transaction)) {
      await this.transactionRepository.releaseExpiredReservations(
        this.clock.now(),
        this.config.reservationTtlSeconds,
      );
      const reloaded =
        await this.transactionRepository.findById(transactionId);
      if (reloaded === null) {
        return err(new TransactionNotFoundError(transactionId));
      }
      details = reloaded;
    }

    const transaction = details.transaction;
    if (
      transaction.status !== 'PENDING' ||
      transaction.paymentStartedAt === null
    ) {
      return ok(buildTransactionView(details));
    }

    let stored: ProviderTransaction | null;
    const providerId = transaction.providerTransactionId;
    if (providerId !== null) {
      stored = await this.readProviderSafely(() =>
        this.paymentGateway.getTransaction(providerId),
      );
    } else {
      stored = await this.readProviderSafely(() =>
        this.paymentGateway.findByReference(transaction.reference),
      );
      if (stored !== null) {
        await this.transactionRepository.attachProviderTransaction({
          transactionId: transaction.id,
          providerTransactionId: stored.id,
        });
      }
    }

    if (stored === null || !isFinalProviderStatus(stored.status)) {
      return ok(buildTransactionView(details));
    }

    await this.transactionRepository.finalize(
      buildFinalizeInput(transaction.id, stored),
    );

    const refreshed = await this.transactionRepository.findById(transactionId);
    if (refreshed === null) {
      return err(new TransactionNotFoundError(transactionId));
    }
    return ok(buildTransactionView(refreshed));
  }

  private isExpiredUnstartedReservation(transaction: Transaction): boolean {
    if (
      transaction.status !== 'PENDING' ||
      transaction.paymentStartedAt !== null
    ) {
      return false;
    }
    const ageMs = this.clock.now().getTime() - transaction.createdAt.getTime();
    return ageMs > this.config.reservationTtlSeconds * 1000;
  }

  private async readProviderSafely<T>(call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch (error) {
      if (
        error instanceof PaymentProviderUnavailableError ||
        error instanceof PaymentProviderRejectedError
      ) {
        return null;
      }
      throw error;
    }
  }
}