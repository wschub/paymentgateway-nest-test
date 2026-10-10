import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import type {
  CreateCardTransactionInput,
  MerchantInfo,
  PaymentGateway,
  ProviderTransaction,
  ProviderTransactionStatus,
} from '../../domain/ports/payment-gateway.port';

export interface HttpPaymentGatewayOptions {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  timeoutMs: number;
}

export interface FakeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FetchLike {
  (
    url: string,
    init: {
      method: 'GET' | 'POST';
      headers: Record<string, string>;
      body?: string;
      signal: AbortSignal;
    },
  ): Promise<FakeResponse>;
}

type RawData = Record<string, unknown>;

export const buildIntegritySignature = (
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string =>
  createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${integritySecret}`)
    .digest('hex');

const asRecord = (value: unknown): RawData =>
  typeof value === 'object' && value !== null ? (value as RawData) : {};

export const isCardTokenError = (body: unknown): boolean => {
  const error = asRecord(asRecord(body).error);
  if (error.type !== 'INPUT_VALIDATION_ERROR') {
    return false;
  }
  const messages = asRecord(error.messages);
  const paymentMethod = asRecord(messages.payment_method);
  const paymentMethodMessages = asRecord(paymentMethod.messages);
  return 'token' in paymentMethodMessages;
};

const isKnownStatus = (value: unknown): value is ProviderTransactionStatus =>
  typeof value === 'string' &&
  ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(value);

@Injectable()
export class HttpPaymentGatewayAdapter implements PaymentGateway {
  private readonly baseUrl: string;
  private readonly logger = new Logger(HttpPaymentGatewayAdapter.name);
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly options: HttpPaymentGatewayOptions,
    fetchImpl?: FetchLike,
  ) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async getMerchantInfo(): Promise<MerchantInfo> {
    const { body } = await this.call(
      `/merchants/${this.options.publicKey}`,
      { method: 'GET' },
    );
    const data = asRecord(asRecord(body).data);
    const acceptance = asRecord(data.presigned_acceptance);
    const personal = asRecord(data.presigned_personal_data_auth);
    const installments = asRecord(data.installments_config);
    return {
      acceptanceToken: this.readString(acceptance.acceptance_token),
      personalDataAuthToken: this.readString(personal.acceptance_token),
      contracts: {
        terms: this.readString(acceptance.permalink),
        personalData: this.readString(personal.permalink),
      },
      installments: {
        default: this.readInteger(installments.default_installments),
        max: this.readInteger(installments.max_installments),
      },
    };
  }

  async createCardTransaction(
    input: CreateCardTransactionInput,
  ): Promise<ProviderTransaction> {
    const signature = buildIntegritySignature(
      input.reference,
      input.amountInCents,
      input.currency,
      this.options.integritySecret,
    );
    const installments = input.installments ?? 1;
    const { body } = await this.call('/transactions', {
      method: 'POST',
      withAuth: true,
      body: {
        acceptance_token: input.acceptanceToken,
        accept_personal_auth: input.acceptPersonalAuth,
        amount_in_cents: input.amountInCents,
        currency: input.currency,
        signature,
        customer_email: input.customerEmail,
        reference: input.reference,
        payment_method: {
          type: 'CARD',
          token: input.cardToken,
          installments,
        },
      },
    });
    const data = asRecord(asRecord(body).data);
    return {
      id: this.readString(data.id),
      reference: input.reference,
      status: this.mapStatus(data.status),
      statusMessage: null,
      amountInCents: input.amountInCents,
      currency: input.currency,
      cardBrand: null,
      cardLastFour: null,
      installments,
      createdAt: null,
    };
  }

  async getTransaction(id: string): Promise<ProviderTransaction> {
    const { body } = await this.call(`/transactions/${id}`, {
      method: 'GET',
      withAuth: true,
    });
    const data = asRecord(asRecord(body).data);
    if (Object.keys(data).length === 0) {
      throw new PaymentProviderUnavailableError('malformed_response');
    }
    return this.mapProviderTransaction(data);
  }

  async findByReference(reference: string): Promise<ProviderTransaction | null> {
    const { body } = await this.call(
      `/transactions?reference=${encodeURIComponent(reference)}`,
      { method: 'GET', withAuth: true },
    );
    const data = asRecord(body).data;
    const list = Array.isArray(data) ? data : [];
    const first = list[0];
    return first === undefined ? null : this.mapProviderTransaction(asRecord(first));
  }

  private mapProviderTransaction(data: RawData): ProviderTransaction {
    const paymentMethod = asRecord(data.payment_method);
    const extra = asRecord(paymentMethod.extra);
    return {
      id: this.readString(data.id),
      reference: this.readString(data.reference),
      status: this.mapStatus(data.status),
      statusMessage:
        data.status_message === null || data.status_message === undefined
          ? null
          : this.readString(data.status_message),
      amountInCents: this.readInteger(data.amount_in_cents),
      currency: this.readString(data.currency),
      cardBrand: extra.brand === undefined ? null : this.readString(extra.brand),
      cardLastFour:
        extra.last_four === undefined ? null : this.readString(extra.last_four),
      installments:
        paymentMethod.installments === undefined ||
        paymentMethod.installments === null
          ? null
          : this.readInteger(paymentMethod.installments),
      createdAt:
        typeof data.created_at === 'string'
          ? new Date(data.created_at)
          : null,
    };
  }

  private mapStatus(status: unknown): ProviderTransactionStatus {
    if (isKnownStatus(status)) {
      return status;
    }
    this.logger.warn(
      'Unknown provider transaction status received; mapping it to PENDING',
    );
    return 'PENDING';
  }

  private async call(
    path: string,
    options: { method: 'GET' | 'POST'; body?: RawData; withAuth?: boolean },
  ): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (options.withAuth === true) {
        headers.Authorization = `Bearer ${this.options.privateKey}`;
      }
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const body = await this.readBody(response);
      if (!response.ok) {
        if (response.status >= 500) {
          throw new PaymentProviderUnavailableError('http_5xx', response.status);
        }
        if (response.status === 408) {
          throw new PaymentProviderUnavailableError('http_408', 408);
        }
        if (response.status === 429) {
          throw new PaymentProviderUnavailableError('http_429', 429);
        }
        if (isCardTokenError(body)) {
          throw new InvalidPaymentTokenError();
        }
        throw new PaymentProviderRejectedError(response.status);
      }
      return { status: response.status, body };
    } catch (error) {
      if (
        error instanceof PaymentProviderUnavailableError ||
        error instanceof PaymentProviderRejectedError ||
        error instanceof InvalidPaymentTokenError
      ) {
        throw error;
      }
      const name = error instanceof Error ? error.name : '';
      throw new PaymentProviderUnavailableError(
        name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBody(response: FakeResponse): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private readString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return '';
  }

  private readInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) ? value : 1;
  }
}