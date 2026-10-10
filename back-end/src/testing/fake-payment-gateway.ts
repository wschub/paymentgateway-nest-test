import { InvalidPaymentTokenError } from '../domain/errors/invalid-payment-token.error';
import { PaymentProviderRejectedError } from '../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../domain/errors/payment-provider-unavailable.error';
import type {
  CreateCardTransactionInput,
  MerchantInfo,
  PaymentGateway,
  ProviderTransaction,
  ProviderTransactionStatus,
} from '../domain/ports/payment-gateway.port';

export type FakeCreateBehavior =
  | { kind: 'status'; status: ProviderTransactionStatus; statusMessage: string | null }
  | { kind: 'timeout' }
  | { kind: 'timeout_after_create'; status: ProviderTransactionStatus; statusMessage: string | null }
  | { kind: 'token_rejected' }
  | { kind: 'other_4xx' }
  | { kind: 'server_error' };

export interface RecordedGatewayCall {
  method: 'getMerchantInfo' | 'createCardTransaction' | 'getTransaction' | 'findByReference';
  id?: string;
  reference?: string;
  input?: CreateCardTransactionInput;
}

export class FakePaymentGateway implements PaymentGateway {
  private readonly nextCreateBehaviors: FakeCreateBehavior[] = [];
  private readonly transactionsById = new Map<string, ProviderTransaction>();
  private readonly transactionsByReference = new Map<
    string,
    ProviderTransaction
  >();
  private readonly calls: RecordedGatewayCall[] = [];
  private idCounter = 0;
  private merchantInfoUnavailable = false;

  constructor(private readonly merchantInfo: MerchantInfo) {}

  enqueueStatus(
    status: ProviderTransactionStatus,
    statusMessage: string | null = null,
  ): void {
    this.nextCreateBehaviors.push({ kind: 'status', status, statusMessage });
  }

  simulateTimeout(): void {
    this.nextCreateBehaviors.push({ kind: 'timeout' });
  }

  simulateLossAfterCreate(
    status: ProviderTransactionStatus = 'PENDING',
    statusMessage: string | null = null,
  ): void {
    this.nextCreateBehaviors.push({
      kind: 'timeout_after_create',
      status,
      statusMessage,
    });
  }

  simulateTokenRejected(): void {
    this.nextCreateBehaviors.push({ kind: 'token_rejected' });
  }

  simulateRejected(): void {
    this.nextCreateBehaviors.push({ kind: 'other_4xx' });
  }

  simulateServerError(): void {
    this.nextCreateBehaviors.push({ kind: 'server_error' });
  }

  simulateMerchantUnavailable(): void {
    this.merchantInfoUnavailable = true;
  }

  recordedCalls(): readonly RecordedGatewayCall[] {
    return [...this.calls];
  }

  async getMerchantInfo(): Promise<MerchantInfo> {
    this.calls.push({ method: 'getMerchantInfo' });
    if (this.merchantInfoUnavailable) {
      throw new PaymentProviderUnavailableError();
    }
    return this.merchantInfo;
  }

  async createCardTransaction(
    input: CreateCardTransactionInput,
  ): Promise<ProviderTransaction> {
    this.calls.push({ method: 'createCardTransaction', input });

    const behavior =
      this.nextCreateBehaviors.shift() ?? {
        kind: 'status' as const,
        status: 'APPROVED' as const,
        statusMessage: null,
      };

    switch (behavior.kind) {
      case 'timeout':
        throw new PaymentProviderUnavailableError();
      case 'token_rejected':
        throw new InvalidPaymentTokenError();
      case 'other_4xx':
        throw new PaymentProviderRejectedError();
      case 'server_error':
        throw new PaymentProviderUnavailableError();
      case 'status': {
        const transaction = this.buildProviderTransaction(
          input,
          behavior.status,
          behavior.statusMessage,
        );
        this.store(transaction);
        return transaction;
      }
      case 'timeout_after_create': {
        const transaction = this.buildProviderTransaction(
          input,
          behavior.status,
          behavior.statusMessage,
        );
        this.store(transaction);
        throw new PaymentProviderUnavailableError();
      }
    }
  }

  async getTransaction(id: string): Promise<ProviderTransaction | null> {
    this.calls.push({ method: 'getTransaction', id });
    return this.transactionsById.get(id) ?? null;
  }

  async findByReference(reference: string): Promise<ProviderTransaction | null> {
    this.calls.push({ method: 'findByReference', reference });
    return this.transactionsByReference.get(reference) ?? null;
  }

  private buildProviderTransaction(
    input: CreateCardTransactionInput,
    status: ProviderTransactionStatus,
    statusMessage: string | null,
  ): ProviderTransaction {
    return {
      id: `provider-tx-${++this.idCounter}`,
      reference: input.reference,
      status,
      statusMessage,
      amountInCents: input.amountInCents,
      currency: input.currency,
      cardBrand: 'VISA',
      cardLastFour: '4242',
      installments: input.installments,
      createdAt: new Date('2026-10-09T10:01:00.000Z'),
    };
  }

  private store(transaction: ProviderTransaction): void {
    this.transactionsById.set(transaction.id, transaction);
    this.transactionsByReference.set(transaction.reference, transaction);
  }
}