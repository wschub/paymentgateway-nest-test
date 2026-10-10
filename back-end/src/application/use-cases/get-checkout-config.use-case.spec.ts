import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import type {
  MerchantInfo,
  PaymentGateway,
} from '../../domain/ports/payment-gateway.port';
import { ok } from '../result/result';
import type { AppConfigValues } from '../config-values';
import {
  GetCheckoutConfigUseCase,
  type CheckoutConfigOutput,
} from './get-checkout-config.use-case';

const config: AppConfigValues = {
  publicKey: 'pub_test_config_key',
  baseUrl: 'https://pay.example.test/v1',
  currency: 'COP',
  paymentClaimLeaseSeconds: 120,
};

const merchantInfo: MerchantInfo = {
  publicKey: 'pub_test_merchant_key',
  baseUrl: 'https://sandbox.invalid/v1',
  currency: 'USD',
  contracts: {
    terms: 'https://example.test/terms',
    personalData: 'https://example.test/privacy',
  },
  installments: { default: 1, max: 36 },
};

const buildGateway = (): PaymentGateway => ({
  getMerchantInfo: async () => merchantInfo,
  createCardTransaction: async () => {
    throw new Error('not used in this spec');
  },
  getTransaction: async () => null,
  findByReference: async () => null,
});

describe('GetCheckoutConfigUseCase', () => {
  it('returns the public config values with the merchant contracts and installments', async () => {
    const useCase = new GetCheckoutConfigUseCase(config, buildGateway());

    const result = await useCase.execute();

    const expected: CheckoutConfigOutput = {
      publicKey: config.publicKey,
      baseUrl: config.baseUrl,
      currency: config.currency,
      contracts: merchantInfo.contracts,
      installments: merchantInfo.installments,
    };
    expect(result).toEqual(ok(expected));
  });

  it('exposes no secret or merchant-private value', async () => {
    const useCase = new GetCheckoutConfigUseCase(config, buildGateway());

    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(Object.keys(result.value).sort()).toEqual([
      'baseUrl',
      'contracts',
      'currency',
      'installments',
      'publicKey',
    ]);
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain('pub_test_merchant_key');
    expect(serialized).not.toContain('sandbox.invalid');
    expect(serialized).not.toContain('prv');
  });

  it('returns a Result error when the merchant info cannot be read', async () => {
    const failedGateway: PaymentGateway = {
      ...buildGateway(),
      getMerchantInfo: async () => {
        throw new PaymentProviderUnavailableError();
      },
    };
    const useCase = new GetCheckoutConfigUseCase(config, failedGateway);

    const result = await useCase.execute();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(PaymentProviderUnavailableError);
  });

  it('rethrows errors that are not provider failures', async () => {
    const failingGateway: PaymentGateway = {
      ...buildGateway(),
      getMerchantInfo: async () => {
        throw new Error('provider down');
      },
    };
    const useCase = new GetCheckoutConfigUseCase(config, failingGateway);

    await expect(useCase.execute()).rejects.toThrow('provider down');
  });
});