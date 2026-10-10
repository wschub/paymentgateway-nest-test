import type {
  CreateCardTransactionInput,
  MerchantInfo,
  PaymentGateway,
  ProviderTransaction,
} from './payment-gateway.port';

describe('PaymentGateway port', () => {
  const merchantInfo: MerchantInfo = {
    acceptanceToken: 'tok_acceptance_test',
    personalDataAuthToken: 'tok_personal_data_test',
    contracts: {
      terms: 'https://example.test/terms',
      personalData: 'https://example.test/privacy',
    },
    installments: { default: 1, max: 12 },
  };

  const input: CreateCardTransactionInput = {
    acceptanceToken: 'tok_acceptance_test',
    acceptPersonalAuth: 'tok_personal_data_test',
    reference: 'TXN-A1B2C3D4E5F6G7H8',
    cardToken: 'tok_test_1234',
    amountInCents: 74500,
    currency: 'COP',
    installments: 3,
    customerEmail: 'diana@example.com',
  };

  const providerTransaction: ProviderTransaction = {
    id: 'provider-tx-1',
    reference: input.reference,
    status: 'APPROVED',
    statusMessage: null,
    amountInCents: input.amountInCents,
    currency: input.currency,
    cardBrand: 'VISA',
    cardLastFour: '4242',
    installments: 3,
    createdAt: new Date('2026-10-09T10:01:00.000Z'),
  };

  const gateway: PaymentGateway = {
    getMerchantInfo: async () => merchantInfo,
    createCardTransaction: async () => providerTransaction,
    getTransaction: async () => providerTransaction,
    findByReference: async () => providerTransaction,
  };

  it('exposes the merchant public configuration', async () => {
    await expect(gateway.getMerchantInfo()).resolves.toEqual(merchantInfo);
  });

  it('creates a card transaction with the input reference', async () => {
    const created = await gateway.createCardTransaction(input);

    expect(created.reference).toBe(input.reference);
    expect(created.amountInCents).toBe(input.amountInCents);
  });

  it('looks up transactions by provider id and by reference', async () => {
    await expect(gateway.getTransaction(providerTransaction.id)).resolves.toEqual(
      providerTransaction,
    );
    await expect(
      gateway.findByReference(input.reference),
    ).resolves.toEqual(providerTransaction);
  });
});