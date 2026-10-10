import { Logger } from '@nestjs/common';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import {
  buildIntegritySignature,
  HttpPaymentGatewayAdapter,
  isCardTokenError,
  type FetchLike,
  type FakeResponse,
} from './http-payment-gateway.adapter';

const OPTIONS = {
  baseUrl: 'https://sandbox.invalid/v1/',
  publicKey: 'pub_test_public_key',
  privateKey: 'prv_test_private_key',
  integritySecret: 'integrity_test_secret',
  timeoutMs: 50,
};

const CARD_TOKEN = 'tok_card_sensitive_42';
const ACCEPTANCE_TOKEN = 'tok_acceptance_sensitive';
const PERSONAL_TOKEN = 'tok_personal_sensitive';
const SIGNATURE = 'b1badadddeadbeef00f0fdf00ddeadbeefcaccadef1badf00ddeadbeefc0ffee';

const jsonResponse = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const brokenJsonResponse = (status: number): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    throw new SyntaxError('Unexpected token');
  },
});

const merchantBody = {
  data: {
    presigned_acceptance: {
      acceptance_token: ACCEPTANCE_TOKEN,
      permalink: 'https://host.example.test/permalink/terms',
    },
    presigned_personal_data_auth: {
      acceptance_token: PERSONAL_TOKEN,
      permalink: 'https://host.example.test/permalink/personal',
    },
    installments_config: {
      default_installments: 1,
      max_installments: 36,
    },
  },
};

const providerTransactionBody = {
  data: {
    id: 'provider-tx-9',
    reference: 'TXN-A1B2C3D4E5F6G7H8',
    status: 'APPROVED',
    status_message: 'ok',
    amount_in_cents: 74500,
    currency: 'COP',
    created_at: '2026-10-09T10:01:00.000Z',
    payment_method: {
      installments: 3,
      extra: { brand: 'VISA', last_four: '4242' },
    },
  },
};

const tokenErrorBody = {
  error: {
    type: 'INPUT_VALIDATION_ERROR',
    messages: {
      payment_method: {
        messages: { token: ['The token is invalid'] },
      },
    },
  },
};

describe('buildIntegritySignature', () => {
  it('matches the known signature vector', () => {
    expect(
      buildIntegritySignature(
        'sk8-438k4-xmxm392-sn2m',
        2490000,
        'COP',
        'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
      ),
    ).toBe('37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
  });
});

describe('isCardTokenError', () => {
  it('returns true for the real sandbox token-error shape', () => {
    expect(isCardTokenError(tokenErrorBody)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'boom'],
    ['a wrong type', { error: { type: 'BUSINESS_RULE' } }],
    [
      'an input validation error about another field',
      {
        error: {
          type: 'INPUT_VALIDATION_ERROR',
          messages: { customer_email: { messages: { customer_email: ['bad'] } } },
        },
      },
    ],
  ])('returns false for %s', (_name, body) => {
    expect(isCardTokenError(body)).toBe(false);
  });
});

describe('HttpPaymentGatewayAdapter', () => {
  let loggerWarn: jest.SpyInstance;

  const makeAdapter = (fetchImpl: FetchLike) =>
    new HttpPaymentGatewayAdapter({ ...OPTIONS }, fetchImpl);

  beforeEach(() => {
    loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const describeNoLeaks = (produced: unknown): void => {
    const serialized = JSON.stringify(produced);
    expect(serialized).not.toContain(OPTIONS.privateKey);
    expect(serialized).not.toContain(OPTIONS.integritySecret);
    expect(serialized).not.toContain(CARD_TOKEN);
    expect(serialized).not.toContain(ACCEPTANCE_TOKEN);
    expect(serialized).not.toContain(PERSONAL_TOKEN);
    expect(serialized).not.toContain(SIGNATURE);
  };

  it('reads the merchant info without any Authorization header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, merchantBody));
    const adapter = makeAdapter(fetchMock);

    const info = await adapter.getMerchantInfo();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.invalid/v1/merchants/pub_test_public_key');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({});
    expect(info).toEqual({
      acceptanceToken: ACCEPTANCE_TOKEN,
      personalDataAuthToken: PERSONAL_TOKEN,
      contracts: {
        terms: 'https://host.example.test/permalink/terms',
        personalData: 'https://host.example.test/permalink/personal',
      },
      installments: { default: 1, max: 36 },
    });
  });

  it('defaults installments to 1/1 when the provider omits them', async () => {
    const body = {
      data: {
        presigned_acceptance: merchantBody.data.presigned_acceptance,
        presigned_personal_data_auth: merchantBody.data.presigned_personal_data_auth,
      },
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    const adapter = makeAdapter(fetchMock);

    const info = await adapter.getMerchantInfo();

    expect(info.installments).toEqual({ default: 1, max: 1 });
  });

  it('creates the provider transaction with the exact contract body and signature', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {
      data: { id: 'provider-tx-9', status: 'PENDING' },
    }));
    const adapter = makeAdapter(fetchMock);

    const result = await adapter.createCardTransaction({
      acceptanceToken: ACCEPTANCE_TOKEN,
      acceptPersonalAuth: PERSONAL_TOKEN,
      reference: 'TXN-A1B2C3D4E5F6G7H8',
      cardToken: CARD_TOKEN,
      amountInCents: 74500,
      currency: 'COP',
      installments: 3,
      customerEmail: 'diana@example.com',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.invalid/v1/transactions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${OPTIONS.privateKey}`,
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      acceptance_token: ACCEPTANCE_TOKEN,
      accept_personal_auth: PERSONAL_TOKEN,
      amount_in_cents: 74500,
      currency: 'COP',
      signature: buildIntegritySignature(
        'TXN-A1B2C3D4E5F6G7H8',
        74500,
        'COP',
        OPTIONS.integritySecret,
      ),
      customer_email: 'diana@example.com',
      reference: 'TXN-A1B2C3D4E5F6G7H8',
      payment_method: { type: 'CARD', token: CARD_TOKEN, installments: 3 },
    });
    expect(result).toEqual({
      id: 'provider-tx-9',
      reference: 'TXN-A1B2C3D4E5F6G7H8',
      status: 'PENDING',
      statusMessage: null,
      amountInCents: 74500,
      currency: 'COP',
      cardBrand: null,
      cardLastFour: null,
      installments: 3,
      createdAt: null,
    });
  });

  it('reads one provider transaction with the private key and maps all the fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, providerTransactionBody));
    const adapter = makeAdapter(fetchMock);

    const tx = await adapter.getTransaction('provider-tx-9');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.invalid/v1/transactions/provider-tx-9');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${OPTIONS.privateKey}`,
    });
    expect(tx).toEqual({
      id: 'provider-tx-9',
      reference: 'TXN-A1B2C3D4E5F6G7H8',
      status: 'APPROVED',
      statusMessage: 'ok',
      amountInCents: 74500,
      currency: 'COP',
      cardBrand: 'VISA',
      cardLastFour: '4242',
      installments: 3,
      createdAt: new Date('2026-10-09T10:01:00.000Z'),
    });
  });

  it('finds the first transaction by reference with URL encoding', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {
      data: [providerTransactionBody.data, { ...providerTransactionBody.data, id: 'second' }],
      meta: { total: 2 },
    }));
    const adapter = makeAdapter(fetchMock);

    const found = await adapter.findByReference('TXN-A1B2C3D4E5F6G7H8');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.invalid/v1/transactions?reference=TXN-A1B2C3D4E5F6G7H8',
    );
    expect(init.headers).toEqual({
      Authorization: `Bearer ${OPTIONS.privateKey}`,
    });
    expect(found?.id).toBe('provider-tx-9');
  });

  it('encodes references with special characters and returns null when empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: [] }));
    const adapter = makeAdapter(fetchMock);

    const found = await adapter.findByReference('TXN-+&=');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.invalid/v1/transactions?reference=TXN-%2B%26%3D',
    );
    expect(found).toBeNull();
  });

  it('maps an unknown provider status to PENDING with a safe warning', async () => {
    const body = {
      data: { ...providerTransactionBody.data, status: 'WEIRD_STATE' },
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    const adapter = makeAdapter(fetchMock);

    const tx = await adapter.getTransaction('provider-tx-9');

    expect(tx).not.toBeNull();
    if (tx === null) {
      return;
    }
    expect(tx.status).toBe('PENDING');
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    loggerWarn.mock.calls.forEach((call) => describeNoLeaks(call));
  });

  it('fails with PaymentProviderUnavailableError when the request times out', async () => {
    const hangingFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    const adapter = makeAdapter(hangingFetch);

    await expect(adapter.getMerchantInfo()).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
  });

  it('fails with PaymentProviderUnavailableError on a network failure', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const adapter = makeAdapter(fetchMock);

    await expect(adapter.getMerchantInfo()).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
  });

  it('fails with PaymentProviderUnavailableError on HTTP 5xx without leaking anything', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(502, { error: 'internal provider trace' }),
    );
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getMerchantInfo();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      describeNoLeaks(error);
      expect(JSON.stringify(error)).not.toContain('internal provider trace');
    }
  });

  it('throws a malformed_response error when a 2xx response has no data object', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getTransaction('provider-tx-9');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      expect((error as PaymentProviderUnavailableError).kind).toBe(
        'malformed_response',
      );
      describeNoLeaks(error);
    }
  });

  it.each<[string, number, string]>([
    ['http_408', 408, 'http_408'],
    ['http_429', 429, 'http_429'],
  ])('treats HTTP %s as a timeout-like unavailability', async (_name, status, kind) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(status, {}));
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getTransaction('provider-tx-9');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      expect((error as PaymentProviderUnavailableError).kind).toBe(kind);
      expect((error as PaymentProviderUnavailableError).httpStatus).toBe(status);
    }
  });

  it('marks timeouts with the timeout kind', async () => {
    const hangingFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    const adapter = makeAdapter(hangingFetch);

    try {
      await adapter.getMerchantInfo();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      expect((error as PaymentProviderUnavailableError).kind).toBe('timeout');
      expect((error as PaymentProviderUnavailableError).httpStatus).toBeUndefined();
    }
  });

  it('marks network failures with the network kind', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getMerchantInfo();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      expect((error as PaymentProviderUnavailableError).kind).toBe('network');
    }
  });

  it('marks 5xx with the http_5xx kind and the status code only', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(502, { error: 'internal provider trace' }),
    );
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getMerchantInfo();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderUnavailableError);
      expect((error as PaymentProviderUnavailableError).kind).toBe('http_5xx');
      expect((error as PaymentProviderUnavailableError).httpStatus).toBe(502);
      describeNoLeaks(error);
      expect(JSON.stringify(error)).not.toContain('internal provider trace');
    }
  });

  it('marks rejected requests with only the status code', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(422, {
      error: { type: 'BUSINESS_RULE', messages: {} },
    }));
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getTransaction('provider-tx-9');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderRejectedError);
      expect((error as PaymentProviderRejectedError).httpStatus).toBe(422);
    }
  });

  it('maps a token validation error to InvalidPaymentTokenError', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(422, tokenErrorBody));
    const adapter = makeAdapter(fetchMock);

    await expect(
      adapter.createCardTransaction({
        acceptanceToken: ACCEPTANCE_TOKEN,
        acceptPersonalAuth: PERSONAL_TOKEN,
        reference: 'TXN-A1B2C3D4E5F6G7H8',
        cardToken: CARD_TOKEN,
        amountInCents: 74500,
        currency: 'COP',
        installments: 1,
        customerEmail: 'diana@example.com',
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentTokenError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps an input validation error about another field to a rejected error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(422, {
      error: {
        type: 'INPUT_VALIDATION_ERROR',
        messages: {
          customer_email: { messages: { customer_email: ['invalid email'] } },
        },
      },
    }));
    const adapter = makeAdapter(fetchMock);

    try {
      await adapter.getMerchantInfo();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentProviderRejectedError);
      expect((error as Error).message).toBe(
        'The payment provider rejected the transaction',
      );
      expect(JSON.stringify(error)).not.toContain('invalid email');
    }
  });

  it('maps a malformed 4xx body to a rejected error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(brokenJsonResponse(400));
    const adapter = makeAdapter(fetchMock);

    await expect(adapter.getMerchantInfo()).rejects.toBeInstanceOf(
      PaymentProviderRejectedError,
    );
  });

  it('never sends the public key as a bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {
      data: { id: 'provider-tx-9', status: 'PENDING' },
    }));
    const adapter = makeAdapter(fetchMock);

    await adapter.getTransaction('provider-tx-9');

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.stringify(init.headers)).not.toContain(OPTIONS.publicKey);
    expect(JSON.stringify(init.headers)).not.toContain(OPTIONS.integritySecret);
  });
});