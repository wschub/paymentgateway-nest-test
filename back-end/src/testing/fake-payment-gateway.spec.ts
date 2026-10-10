import { InvalidPaymentTokenError } from '../domain/errors/invalid-payment-token.error';
import { PaymentProviderRejectedError } from '../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../domain/errors/payment-provider-unavailable.error';
import type {
  CreateCardTransactionInput,
  MerchantInfo,
} from '../domain/ports/payment-gateway.port';
import { FakePaymentGateway } from './fake-payment-gateway';

describe('FakePaymentGateway', () => {
  const merchantInfo: MerchantInfo = {
    publicKey: 'pub_test_public_key',
    baseUrl: 'https://sandbox.invalid/v1',
    currency: 'COP',
    contracts: {
      terms: 'https://example.test/terms',
      personalData: 'https://example.test/privacy',
    },
    installments: { default: 1, max: 12 },
  };

  const input: CreateCardTransactionInput = {
    reference: 'TXN-A1B2C3D4E5F6G7H8',
    cardToken: 'tok_test_1234',
    amountInCents: 74500,
    currency: 'COP',
    installments: 3,
    customerEmail: 'diana@example.com',
  };

  it('returns the public merchant configuration', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);

    await expect(gateway.getMerchantInfo()).resolves.toEqual(merchantInfo);
  });

  it('enqueues approved, declined, error and unknown statuses for the next create', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.enqueueStatus('APPROVED');
    gateway.enqueueStatus('DECLINED');
    gateway.enqueueStatus('ERROR');
    gateway.enqueueStatus('UNKNOWN');

    expect((await gateway.createCardTransaction(input)).status).toBe('APPROVED');
    expect((await gateway.createCardTransaction(input)).status).toBe('DECLINED');
    expect((await gateway.createCardTransaction(input)).status).toBe('ERROR');
    expect((await gateway.createCardTransaction(input)).status).toBe('UNKNOWN');
  });

  it('defaults to APPROVED when no status is enqueued', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);

    expect((await gateway.createCardTransaction(input)).status).toBe('APPROVED');
  });

  it('records every call with its payload', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);

    await gateway.getMerchantInfo();
    await gateway.createCardTransaction(input);
    await gateway.createCardTransaction(input);
    await gateway.getTransaction('provider-tx-1');
    await gateway.findByReference(input.reference);

    const calls = gateway.recordedCalls();

    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual({ method: 'getMerchantInfo' });
    expect(calls[1]).toEqual({
      method: 'createCardTransaction',
      input,
    });
    expect(calls[2].method).toBe('createCardTransaction');
    expect(calls[3]).toEqual({ method: 'getTransaction', id: 'provider-tx-1' });
    expect(calls[4]).toEqual({
      method: 'findByReference',
      reference: input.reference,
    });
  });

  it('lets a created transaction be reconciled by id and by reference', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.enqueueStatus('APPROVED');

    const created = await gateway.createCardTransaction(input);

    await expect(gateway.getTransaction(created.id)).resolves.toEqual(created);
    await expect(gateway.findByReference(input.reference)).resolves.toEqual(
      created,
    );
  });

  it('returns null when nothing matches a lookup', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);

    await expect(gateway.getTransaction('missing')).resolves.toBeNull();
    await expect(gateway.findByReference('TXN-0000000000000000')).resolves.toBeNull();
  });

  it('simulates a timeout with the unavailable error', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateTimeout();

    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
  });

  it('simulates a 5xx with the unavailable error', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateServerError();

    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
  });

  it('simulates a 4xx about the token with the invalid token error', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateTokenRejected();

    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      InvalidPaymentTokenError,
    );
  });

  it('simulates other 4xx responses with the provider rejected error', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateRejected();

    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      PaymentProviderRejectedError,
    );
  });

  it('recovers after a simulated failure', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateTimeout();
    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );

    gateway.enqueueStatus('DECLINED');
    const recovered = await gateway.createCardTransaction(input);

    expect(recovered.status).toBe('DECLINED');
  });

  it('simulates an unavailable merchant info read', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateMerchantUnavailable();

    await expect(gateway.getMerchantInfo()).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
  });

  it('simulates a lost response: the provider stored the transaction but the call throws', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.simulateLossAfterCreate('PENDING');

    await expect(gateway.createCardTransaction(input)).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );

    const reconciled = await gateway.findByReference(input.reference);
    expect(reconciled).not.toBeNull();
    expect(reconciled?.status).toBe('PENDING');
  });

  it('attaches the enqueued status message to the provider transaction', async () => {
    const gateway = new FakePaymentGateway(merchantInfo);
    gateway.enqueueStatus('DECLINED', 'Card declined by issuer');

    const created = await gateway.createCardTransaction(input);

    expect(created.status).toBe('DECLINED');
    expect(created.statusMessage).toBe('Card declined by issuer');
  });
});