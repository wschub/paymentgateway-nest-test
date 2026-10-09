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
  | { kind: 'status'; status: ProviderTransactionStatus }
  | { kind: 'timeout' }
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

  constructor(private readonly merchantInfo: MerchantInfo) {}

  enqueueStatus(status: ProviderTransactionStatus): void {
    this.nextCreateBehaviors.push({ kind: 'status', status });
  }

  simulateTimeout(): void {
    this.nextCreateBehaviors.push({ kind: 'timeout' });
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

  recordedCalls(): readonly RecordedGatewayCall[] {
    return [...this.calls];
  }

  async getMerchantInfo(): Promise<MerchantInfo> {
    this.calls.push({ method: 'getMerchantInfo' });
    return this.merchantInfo;
  }

  async createCardTransaction(
    input: CreateCardTransactionInput,
  ): Promise<ProviderTransaction> {
    this.calls.push({ method: 'createCardTransaction', input });

    const behavior =
      this.nextCreateBehaviors.shift() ?? { kind: 'status', status: 'APPROVED' as const };

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
        const transaction = this.buildProviderTransaction(input, behavior.status);
        this.transactionsById.set(transaction.id, transaction);
        this.transactionsByReference.set(transaction.reference, transaction);
        return transaction;
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
  ): ProviderTransaction {
    return {
      id: `provider-tx-${++this.idCounter}`,
      reference: input.reference,
      status,
      amountInCents: input.amountInCents,
      currency: input.currency,
      cardBrand: 'VISA',
      cardLastFour: '4242',
      installments: input.installments,
      createdAt: new Date('2026-10-09T10:01:00.000Z'),
    };
  }
}